import type { InterviewPlan} from "@practice-room/shared-types";
import type { AnswerDelivery, InterviewSession } from "../../interviews/interview-session";
import {nextTurn, wrapUpTurn, type InterviewCursor, type InterviewTurn, type TurnAction} from "../../interviews/interviewer";
import {practiceBrief} from "../../interviews/rubric";
import { spawn } from "node:child_process";
import { join } from "node:path";

export type LiveSignals={
    fillers?: number;
    words?: number;
    elapsedMs?: number;
    tabHidden?: number;
    tabAwayMs?: number;
    faces?: number | null;
    latencyMs?: number;
};

export type LiveContext={
    resume?: string;
    jobDescription?: string;
    company?: string;
    role?: string;
    experienceLevel?: string;
    persona?: string;
    practiceMode?: string;
    rubric?: string;
    probes?: number;
    interviewType?: string;
    skills?: string[];
    difficulty?: string;
    asked?: string;
    plannedPrompt?: string;
    codeResult?: string;
    signals?: LiveSignals;
    phase?: string;
    priorAnswer?: string;
};

export interface AnswerEvaluator{
    evaluate(
        plan: InterviewPlan,
        cursor: InterviewCursor,
        answer: string,
        context?: LiveContext,
    ):  Promise<{cursor: InterviewCursor, turn: InterviewTurn, outcome?: "polite_opt_out" | "conceptual_pass"}>;
}

export class MockAnswerEvaluator implements AnswerEvaluator{
    async evaluate(plan: InterviewPlan, cursor: InterviewCursor, answer: string){
        const action: TurnAction=answer.trim().length < 40 ? "stay" : "advance";
        return nextTurn(plan, cursor, {
            action,
            prompt: action === "stay" ? "Say a little more about that." : "Next question.",
        });
    }
}

type ModelLine={prompt: string; action: TurnAction; hint?: string; sectionName?: string; clarifying?: boolean; outcome?: "polite_opt_out" | "conceptual_pass"};

function serviceDir(){
    return join(__dirname, "..", "..", "..", "..", "ai-service");
}

export function askModel(request: Record<string, unknown>): Promise<ModelLine>{
    return new Promise((resolve, reject) => {
        const child=spawn("python", ["live_reply.py"], {cwd: serviceDir()});
        let stdout="";
        let stderr="";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (code) => {
            if(code === 0){
                const line=JSON.parse(stdout) as ModelLine;
                resolve(line);
                return;
            }
            reject(new Error(stderr.trim() || `live_reply.py exited ${code}`));
        });
        child.stdin.write(JSON.stringify(request));
        child.stdin.end();
    });
}

export class McpAnswerEvaluator implements AnswerEvaluator {
    async evaluate(plan: InterviewPlan, cursor: InterviewCursor, answer: string, context: LiveContext = {}) {
      const nextIndex=cursor.introduced === false ? 0 : cursor.sectionIndex + 1;
      const upcoming=plan.sections[nextIndex]?.questions[0]?.prompt ?? "";
      const line=await askModel({
        section: cursor.introduced === false ? "Introduction" : plan.sections[cursor.sectionIndex].name,
        answer,
        asked: context.asked ?? "",
        plannedPrompt: upcoming || context.plannedPrompt || "",
        resume: context.resume ?? "",
        jobDescription: context.jobDescription ?? "",
        company: context.company ?? "",
        role: context.role ?? "",
        experienceLevel: context.experienceLevel ?? "",
        persona: context.persona ?? "recruiter",
        practiceMode: context.practiceMode ?? "real",
        rubric: context.rubric ?? "",
        probes: context.probes ?? cursor.replies ?? 0,
        phase: context.phase ?? "reply",
        interviewType: context.interviewType ?? "",
        skills: context.skills ?? [],
        difficulty: context.difficulty ?? "",
        codeResult: context.codeResult ?? "",
        signals: context.signals ?? {},
        priorAnswer: context.priorAnswer ?? "",
      });
      let action: TurnAction=line.action === "advance" || line.action === "finish" ? line.action : "stay";
      if((cursor.replies ?? 0) >= 2 && action === "stay"){
        action="advance";
      }
      return {...nextTurn(plan, cursor, {action, prompt: line.prompt, hint: line.hint ?? ""}), outcome: line.outcome};
    }
}

function sessionContext(session: InterviewSession): LiveContext{
    const config=session.toRecord().config;
    return {
        resume: config.resume ?? "",
        jobDescription: config.job?.description ?? config.skills.join(", "),
        company: config.job?.company ?? "",
        role: config.job?.role ?? "",
        experienceLevel: config.experienceLevel,
        difficulty: config.difficulty,
        skills: config.skills ?? [],
        persona: config.persona ?? "recruiter",
        practiceMode: config.practiceMode ?? "real",
        rubric: practiceBrief({
            company: config.job?.company,
            role: config.job?.role,
            experienceLevel: config.experienceLevel,
            interviewType: session.interviewType,
            description: config.job?.description ?? config.skills.join(", "),
        }),
        interviewType: session.interviewType,
    };
}

export async function openingLine(session: InterviewSession): Promise<{prompt: string; hint: string}>{
    const topic=session.plan?.sections[0]?.questions[0]?.prompt ?? "";
    const line=await askModel({
        section: "Introduction",
        answer: "",
        asked: topic,
        plannedPrompt: topic,
        phase: "open",
        probes: 0,
        signals: {},
        ...sessionContext(session),
    });
    return {prompt: line.prompt, hint: line.hint ?? ""};
}

const WRAP_UP_MINUTES=10;
const WRAP_UP_RESERVE_MS=2 * 60 * 1000;

export async function answerInterview(session: InterviewSession, answer: string, evaluator: AnswerEvaluator, context: LiveContext = {}): Promise<InterviewTurn>{
    if(session.status !== "live" || !session.plan){
        throw new Error("Interview is not live");
    }
    const deliveryFrom = (): AnswerDelivery => {
        const signals=context.signals ?? {};
        return {
            fillers: signals.fillers ?? 0,
            words: signals.words ?? 0,
            elapsedMs: signals.elapsedMs ?? 0,
            latencyMs: signals.latencyMs ?? 0,
            tabHidden: signals.tabHidden ?? 0,
            tabAwayMs: signals.tabAwayMs ?? 0,
            faces: signals.faces ?? null,
        };
    };
    if(session.cursor.wrapUp){
        const closing=nextTurn(session.plan, session.cursor, {
            action: "finish",
            prompt: "Thank you. That completes the interview.",
        });
        return session.applyAnswer(answer, closing, deliveryFrom());
    }
    const result = await evaluator.evaluate(session.plan, session.cursor, answer, {
        ...sessionContext(session),
        ...context,
        probes: session.cursor.replies ?? 0,
        asked: context.asked ?? session.transcript.at(-1)?.prompt ?? "",
        priorAnswer: context.priorAnswer ?? session.transcript.slice(0, -1).map((entry) => entry.answer).filter(Boolean).slice(-2).join(" "),
    });
    const duration=session.toRecord().config.durationMinutes;
    const elapsed=session.startedAt ? Date.now() - Date.parse(session.startedAt) : null;
    const timeForClose=duration === WRAP_UP_MINUTES && elapsed !== null && elapsed >= duration * 60 * 1000 - WRAP_UP_RESERVE_MS;
    if(duration === WRAP_UP_MINUTES && (timeForClose || result.turn.done)){
        const now=Date.now();
        const budgetEnd=session.startedAt ? Date.parse(session.startedAt) + WRAP_UP_MINUTES * 60 * 1000 : now + WRAP_UP_RESERVE_MS;
        session.wrapUpUntil=new Date(Math.max(budgetEnd, now + WRAP_UP_RESERVE_MS)).toISOString();
        return session.applyAnswer(answer, wrapUpTurn(session.cursor), deliveryFrom());
    }
    return session.applyAnswer(answer, result, deliveryFrom());
}
