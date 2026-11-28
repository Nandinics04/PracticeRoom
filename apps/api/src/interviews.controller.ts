import {BadRequestException, Body, Controller, Post, Param, Get, Delete, Inject, Req, ServiceUnavailableException, UseGuards} from "@nestjs/common";
import { SignedInGuard, type SignedRequest } from "./auth/signed-in.guard";
import { randomUUID } from "node:crypto";
import type { JobInterviewInput, SkillInterviewInput } from "@practice-room/shared-types";
import { prepareInterview } from "./application/interview/prepare-interview";
import { displaySections } from "./interviews/plan";
import { toInterviewConfiguration } from "./interviews/configuration";
import { planFromRequest } from "./interviews/plan-request";
import { SESSION_REPOSITORY, type SessionRepository } from "./interviews/session-repository";
import { LocalSearchProvider } from "./interviews/search-provider";
import { reportInterview, McpReportGenerator } from "./application/interview/report-interview";
import { answerInterview } from "./application/interview/answer-interview";
import { McpQuestionAuthor } from "./interviews/question-author";
import { McpAnswerEvaluator } from "./application/interview/answer-interview";
import { firstQuestion } from "./interviews/interviewer";
import type { InterviewSession } from "./interviews/interview-session";
import { companyNames } from "./interviews/company-names";
import { inspectCandidateCode, runCandidateCode } from "./interviews/code-runner";
import { repairSpokenAnswer } from "./interviews/repair-answer";
import { transcribeAnswer } from "./interviews/transcribe-answer";
import type { LiveSignals } from "./application/interview/answer-interview";




function saidTurns(session: InterviewSession) {
    return session.transcript
        .filter((entry) => entry.answer.trim())
        .map((entry) => ({
            prompt: entry.prompt,
            answer: entry.answer,
            outcome: entry.outcome ?? "",
            action: entry.action ?? "",
        }));
}

function practiceContext(session: InterviewSession) {
    const config = session.toRecord().config;
    const supplied = Boolean(config.resume?.trim() || config.materials?.trim());
    const company = config.job?.company?.trim() ?? "";
    const notes = [config.resume, config.materials, config.job?.description]
        .map((part) => part?.trim() ?? "")
        .filter(Boolean)
        .join("\n\n");
    return {
        company,
        role: config.job?.role?.trim() ?? "",
        skills: config.skills ?? [],
        context: notes.slice(0, 900),
        source: supplied ? "Your notes" : company ? "Company questions" : "Practice template",
        persona: config.persona,
        codingLanguage: config.codingLanguage ?? "",
    };
}

function preloadQuestion(session: InterviewSession) {
    if (!session.plan || session.interviewType === "coding") {
        return "";
    }
    const index = session.status === "ready" || session.cursor.introduced === false ? 0 : session.cursor.sectionIndex + 1;
    const prompt = session.plan.sections[index]?.questions[0]?.prompt ?? "";
    return /^problem statement/i.test(prompt) ? "" : prompt;
}

function sessionTitle(session: InterviewSession) {
    if (session.plan?.title) {
        return session.plan.title;
    }
    const config = session.toRecord().config;
    return config.job ? `${config.job.role} at ${config.job.company}` : config.skills.join(", ");
}

@Controller("interviews")
@UseGuards(SignedInGuard)
export class InterviewsController{
    constructor(@Inject(SESSION_REPOSITORY) private readonly store: SessionRepository) {}

    @Post()
    async create(@Req() request: SignedRequest, @Body() body: (JobInterviewInput & {request?: string}) | (SkillInterviewInput & {request?: string}) | {request?: string; persona?: JobInterviewInput["persona"]; practiceMode?: JobInterviewInput["practiceMode"]; resume?: string; materials?: string}): Promise<{id: string; status: string; title?: string,interviewType: string; sections: {name: string, minutes:number}[]; sourceUrls: string[]; sectionName: string; prompt: string; practiceMode: string; persona: string; problem: string; durationMinutes: number; startsAt: string | null; preload: string}>{
        const note = body.request?.trim() ?? "";
        const input = "mode" in body && body.mode === "job"
            ? {...body, description: note ? `${body.description} The candidate asked: ${note}` : body.description}
            : "mode" in body && body.mode === "skill"
                ? body
                : await planFromRequest({
                    request: note,
                    persona: body.persona,
                    practiceMode: body.practiceMode,
                    resume: "resume" in body ? body.resume : undefined,
                    materials: "materials" in body ? body.materials : undefined,
                });
        let session;
        try {
            session = await prepareInterview(toInterviewConfiguration(input), new LocalSearchProvider(), new McpQuestionAuthor());
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (message === "Company and role are required" || message === "At least one skill is required" || message === "Duration must be greater than 0") {
                throw new BadRequestException(message);
            }
            throw error;
        }
        const id=randomUUID();
        session.assignOwner(request.user.id);
        this.store.save(id,session);
        const opening = session.plan ? firstQuestion(session.plan) : undefined;
        return{
            id,
            status: session.status,
            title: sessionTitle(session),
            interviewType: session.interviewType,
            sections: displaySections(session.plan),
            sourceUrls: session.plan?.sourceUrls ?? [],
            sectionName: opening?.sectionName ?? "",
            prompt: opening?.prompt ?? "",
            practiceMode: session.toRecord().config.practiceMode,
            durationMinutes: session.toRecord().config.durationMinutes,
            startsAt: null,
            preload: preloadQuestion(session),
            problem: codingProblem(session),
            ...practiceContext(session),
        };
    }
    @Post(":id/end")
    end(@Req() request: SignedRequest, @Param("id") id: string){
        const session=this.store.getOwned(id, request.user.id);
        session.end();
        this.store.save(id, session);
        return { status: session.status };
    }
    @Post(":id/start")
    async start(@Req() request: SignedRequest, @Param("id") id: string){
        const session=this.store.getOwned(id, request.user.id);
        if (session.status === "preparing" || session.status === "failed") {
            throw new BadRequestException("The questions could not be prepared. Prepare the room again.");
        }
        const turn = session?.start();
        this.store.save(id, session);
        return{
            status: session?.status,
            sectionName: turn?.sectionName,
            prompt: turn?.prompt,
            hint: "",
            practiceMode: session?.toRecord().config.practiceMode,
            durationMinutes: session?.toRecord().config.durationMinutes,
            startedAt: session?.startedAt,
            wrapUpUntil: session?.wrapUpUntil,
            done: turn?.done,
            preload: preloadQuestion(session),
            problem: codingProblem(session),
        }
    }
    @Post(":id/transcribe")
    async transcribe(@Req() request: SignedRequest, @Param("id") id: string, @Body() body: {audio?: string; mime?: string; hint?: string}){
        const session = this.store.getOwned(id, request.user.id);
        const config = session.toRecord().config;
        const question = session.transcript.at(-1)?.prompt || body.hint || "";
        const heard = await transcribeAnswer({
            audio: body.audio ?? "",
            mime: body.mime,
            hint: body.hint,
            question,
            resume: config.resume ?? "",
            skills: (config.skills ?? []).join(", "),
        });
        return heard;
    }
    @Post(":id/code")
    runCode(@Req() request: SignedRequest, @Param("id") id: string, @Body() body: {code?: string}){
        const session = this.store.getOwned(id, request.user.id);
        if (session.interviewType !== "coding") {
            throw new BadRequestException("This interview does not run code.");
        }
        return inspectCandidateCode(body.code ?? "");
    }
    @Post(":id/answer")
    async answer(@Req() request: SignedRequest, @Param("id") id: string, @Body() body: {answer?: string; code?: string; signals?: LiveSignals; fromWhisper?: boolean}){
        const session=this.store.getOwned(id, request.user.id);
        const spoken=body.answer?.trim() ?? "";
        const code=body.code?.trim() ?? "";
        const config=session?.toRecord().config;
        const heard=session.interviewType === "coding" || body.fromWhisper ? spoken : await repairSpokenAnswer({
            answer: spoken,
            question: session?.transcript.at(-1)?.prompt ?? "",
            resume: config?.resume ?? "",
            company: config?.job?.company ?? "",
            role: config?.job?.role ?? "",
            jobDescription: config?.job?.description ?? config?.skills.join(", ") ?? "",
        });
        const answer=[heard, code].filter(Boolean).join("\n\n");
        const codeResult=session?.interviewType === "coding" ? runCandidateCode(code) : "";
        let turn;
        try {
            turn = await answerInterview(session, answer, new McpAnswerEvaluator(), {codeResult, signals: body.signals});
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            if (/free-models-per-day/i.test(message)) {
                throw new ServiceUnavailableException("OpenRouter has used its free answers for today. Your answer is still in the box.");
            }
            if (/high demand|timed out|model is busy|refused the reply/i.test(message)) {
                throw new ServiceUnavailableException("The interviewer is busy. Your answer is still in the box. Press Submit again.");
            }
            throw error;
        }
        this.store.save(id, session);
        return{
            status: session?.status,
            sectionName: turn?.sectionName,
            prompt: turn?.prompt,
            hint: turn?.hint ?? "",
            done: turn?.done,
            preload: preloadQuestion(session),
            answer: heard,
            durationMinutes: session?.toRecord().config.durationMinutes,
            startedAt: session?.startedAt,
            wrapUpUntil: session?.wrapUpUntil,
            problem: codingProblem(session),
        }
    }
    @Post(":id/report")
    async report(@Req() request: SignedRequest, @Param("id") id: string){
        const session = this.store.getOwned(id, request.user.id);
        const feedback = await reportInterview(session, new McpReportGenerator());
        this.store.save(id, session);
        return {
        status: session?.status,
        ...feedback,
        said: saidTurns(session),
        };

    }
    @Delete(":id")
    remove(@Req() request: SignedRequest, @Param("id") id: string) {
      this.store.getOwned(id, request.user.id);
      this.store.delete(id);
      return { id };
    }
    @Get()
    list(@Req() request: SignedRequest) {
      return this.store.listOwned(request.user.id);
    }
    @Get("companies")
    companies() {
      return companyNames();
    }
    @Get(":id")
    findOne(@Req() request: SignedRequest, @Param("id") id: string){
        const session=this.store.getOwned(id, request.user.id);
        const last=session.transcript.at(-1);
        const opening=session.plan ? firstQuestion(session.plan) : undefined;
        return{
            id,
            status: session?.status,
            title: sessionTitle(session),
            interviewType: session.interviewType,
            sections: displaySections(session.plan),
             sourceUrls: session.plan?.sourceUrls ?? [],
             sectionName: last?.sectionName || opening?.sectionName || "",
             prompt: last?.prompt || opening?.prompt || "",
             practiceMode: session.toRecord().config.practiceMode,
             durationMinutes: session.toRecord().config.durationMinutes,
             startedAt: session.startedAt,
             startsAt: session.startsAt,
             wrapUpUntil: session.wrapUpUntil,
             feedback: session.feedback,
             said: saidTurns(session),
             done: session.status==="completed" || session.status=="report_ready",
             preload: preloadQuestion(session),
             problem: codingProblem(session),
             ...practiceContext(session),
        };
    }
}

function codingProblem(session: InterviewSession) {
    if (session.interviewType !== "coding") {
        return "";
    }
    return session.plan?.sections[0]?.questions[0]?.prompt ?? "";
}