import type { InterviewPlan} from "@practice-room/shared-types";
import type { AnswerDelivery, InterviewSession } from "../../interviews/interview-session";
import {nextTurn, wrapUpTurn, type InterviewCursor, type InterviewTurn, type TurnAction} from "../../interviews/interviewer";
import {practiceBrief} from "../../interviews/rubric";
import { callRoom } from "../../interviews/python-room";

export type LiveSignals={
    fillers?: number;
    words?: number;
    elapsedMs?: number;
    tabHidden?: number;
    tabAwayMs?: number;
    faces?: number | null;
    latencyMs?: number;
    pausedMs?: number;
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

export function askModel(request: Record<string, unknown>): Promise<ModelLine>{
    return callRoom<ModelLine>("reply", request, 12000);
}

function optedOut(answer: string) {
    const text = answer.toLowerCase();
    const cues = ["don't know", "dont know", "do not know", "don't remember", "do not remember", "dont remember", "not sure", "haven't used", "have not used", "brush up", "i'll work on it", "skip this", "next question", "other question", "already answered", "ask me the", "move on"];
    if (!cues.some((cue) => text.includes(cue))) {
        return false;
    }
    const explained = /\bbut\b|conceptually|the idea|it works|works by/.test(text);
    return !(explained && text.trim().split(/\s+/).length >= 12);
}

function sectionBudgetMs(plan: InterviewPlan, cursor: InterviewCursor, _interviewType: string) {
    if (cursor.introduced === false) {
        // Greeting only — keep short. Content sections own the real minutes.
        return 2 * 60 * 1000;
    }
    const minutes = plan.sections[cursor.sectionIndex]?.minutes ?? 5;
    return Math.max(3, minutes) * 60 * 1000;
}

function nextSectionName(plan: InterviewPlan, cursor: InterviewCursor) {
    const index = cursor.introduced === false ? 0 : cursor.sectionIndex + 1;
    return plan.sections[index]?.name ?? "";
}

function sectionSeed(plan: InterviewPlan, index: number) {
    return plan.sections[index]?.questions[0]?.prompt ?? "";
}

function isBehavioralScript(text: string) {
    const lowered = text.toLowerCase();
    return [
        "tell me about a time",
        "disagreed with",
        "team look like",
        "looking back",
        "project you owned",
        "what would you do differently",
        "personally own in that situation",
        "changed how you work",
    ].some((cue) => lowered.includes(cue));
}

function safeSeed(seed: string, interviewType: string | undefined) {
    const kind = interviewType ?? "";
    if (!seed.trim()) {
        return "";
    }
    if (["technical", "coding", "system_design"].includes(kind) && isBehavioralScript(seed)) {
        return "";
    }
    return seed;
}

function typeFallback(interviewType: string | undefined, section: string, role: string, company: string) {
    const seat = [role, company].filter(Boolean).join(" at ") || "this role";
    if (interviewType === "system_design") {
        return `For ${seat}, which requirement would you lock first, and why?`;
    }
    if (interviewType === "coding") {
        return "What part of the problem do you want to tackle next?";
    }
    if (interviewType === "behavioral") {
        return `For ${seat}, what did you personally do in a recent challenge, and what changed?`;
    }
    if (interviewType === "hr") {
        return `What draws you to ${seat}?`;
    }
    if (section.toLowerCase().includes("core")) {
        return `Take one concept from your ${seat} work. On one concrete input, what happens, and what does it cost?`;
    }
    if (section.toLowerCase().includes("follow")) {
        return `One requirement for ${seat} is unfinished. How would you meet it, and what would you verify first?`;
    }
    return `From your ${seat} work, pick one system and explain how data moved through it, and why that shape.`;
}

async function personalize(seed: string, section: string, answer: string, context: LiveContext, prior: string) {
    const kind = context.interviewType ?? "";
    const cleaned = safeSeed(seed, kind);
    const fallback = typeFallback(kind, section, context.role ?? "", context.company ?? "");
    try {
        const line = await askModel({
            phase: "seed_next",
            section,
            answer,
            asked: context.asked ?? "",
            plannedPrompt: cleaned,
            interviewType: kind,
            company: context.company ?? "",
            role: context.role ?? "",
            resume: (context.resume ?? "").slice(0, 500),
            jobDescription: (context.jobDescription ?? "").slice(0, 280),
            skills: context.skills ?? [],
            priorAnswer: prior,
            probes: 0,
            allowStay: false,
        });
        const spoken = line.prompt?.trim() || "";
        if (!spoken || (["technical", "coding", "system_design"].includes(kind) && isBehavioralScript(spoken))) {
            return fallback;
        }
        return spoken;
    } catch {
        return cleaned || fallback;
    }
}

async function prepareBackground(plan: InterviewPlan, cursor: InterviewCursor, context: LiveContext, answer: string, prior: string) {
    const afterNext = (cursor.introduced === false ? 0 : cursor.sectionIndex + 1) + 1;
    if (afterNext >= plan.sections.length) {
        return undefined;
    }
    const section = plan.sections[afterNext];
    const seed = safeSeed(section.questions[0]?.prompt ?? "", context.interviewType);
    const spoken = await personalize(seed, section.name, answer, context, prior);
    return spoken;
}

export class McpAnswerEvaluator implements AnswerEvaluator {
    async evaluate(plan: InterviewPlan, cursor: InterviewCursor, answer: string, context: LiveContext = {}) {
      const nextIndex = cursor.introduced === false ? 0 : cursor.sectionIndex + 1;
      const nextName = nextSectionName(plan, cursor);
      const replies = context.probes ?? cursor.replies ?? 0;
      const coding = context.interviewType === "coding";
      const greeting = cursor.introduced === false;
      const sectionStarted = Date.parse(cursor.sectionStartedAt || "") || Date.now();
      const sectionElapsed = Math.max(0, Date.now() - sectionStarted);
      const budget = sectionBudgetMs(plan, cursor, context.interviewType ?? "");
      const overTime = sectionElapsed >= budget;
      const prior = context.priorAnswer ?? "";
      const currentSection = greeting ? "Greeting" : plan.sections[cursor.sectionIndex].name;
      const kind = context.interviewType ?? "";
      const currentSeed = safeSeed(
        greeting ? sectionSeed(plan, 0) : (plan.sections[cursor.sectionIndex]?.questions[0]?.prompt ?? ""),
        kind,
      );
      const nextSeedSafe = safeSeed(cursor.preparedNext || sectionSeed(plan, nextIndex), kind);

      // Leave a content section only when its minutes are used, or the candidate opts out.
      // Greeting may leave once the model advances (name collected).
      const leaveSection = coding
        ? optedOut(answer)
        : greeting
          ? false
          : overTime || optedOut(answer);

      if (!coding && !greeting && leaveSection) {
        const seed = nextSeedSafe || typeFallback(kind, nextName || "Next", context.role ?? "", context.company ?? "");
        const bridge = overTime && nextName ? `Let's move to ${nextName}.` : optedOut(answer) ? "No problem at all." : "";
        const [spoken, preparedNext] = await Promise.all([
          personalize(seed, nextName || "Next", answer, context, prior),
          prepareBackground(plan, cursor, context, answer, prior),
        ]);
        const prompt = bridge ? `${bridge} ${spoken}` : spoken;
        return {
          ...nextTurn(plan, cursor, {action: "advance", prompt, preparedNext}),
          outcome: optedOut(answer) ? "polite_opt_out" as const : undefined,
        };
      }

      // Still inside the section: follow up (max 2) or ask a fresh question in the same section.
      if (!coding && !greeting && !leaveSection) {
        const needFreshQuestion = replies >= 2;
        if (needFreshQuestion) {
          const seed = currentSeed || typeFallback(kind, currentSection, context.role ?? "", context.company ?? "");
          const [spoken, preparedNext] = await Promise.all([
            personalize(seed, currentSection, answer, context, prior),
            cursor.preparedNext ? Promise.resolve(cursor.preparedNext) : prepareBackground(plan, { ...cursor, introduced: true }, context, answer, prior),
          ]);
          return nextTurn(plan, cursor, {
            action: "stay",
            prompt: spoken,
            resetReplies: true,
            preparedNext,
          });
        }
        const line = await askModel({
          section: currentSection,
          answer,
          asked: context.asked ?? "",
          plannedPrompt: currentSeed,
          nextSection: nextName,
          nextSeed: nextSeedSafe,
          probeNote: plan.sections[cursor.sectionIndex]?.questions[0]?.followUpPrompt ?? "",
          company: context.company ?? "",
          role: context.role ?? "",
          experienceLevel: context.experienceLevel ?? "",
          persona: context.persona ?? "recruiter",
          practiceMode: context.practiceMode ?? "real",
          probes: replies,
          phase: "reply",
          interviewType: kind,
          skills: context.skills ?? [],
          difficulty: context.difficulty ?? "",
          resume: context.resume ?? "",
          jobDescription: context.jobDescription ?? "",
          codeResult: context.codeResult ?? "",
          signals: context.signals ?? {},
          priorAnswer: prior,
          sectionElapsedMs: sectionElapsed,
          sectionBudgetMs: budget,
          forceStayInSection: true,
          allowStay: true,
        });
        let action: TurnAction = line.action === "finish" ? "finish" : "stay";
        if (line.action === "advance" || line.action === "finish") {
          // Time remains — do not leave the section; ask the next question here.
          action = "stay";
        }
        let prompt = line.prompt;
        if (["technical", "coding", "system_design"].includes(kind) && isBehavioralScript(prompt)) {
          prompt = typeFallback(kind, currentSection, context.role ?? "", context.company ?? "");
        }
        const preparedNext = cursor.preparedNext
          ?? await prepareBackground(plan, cursor, context, answer, prior);
        return {
          ...nextTurn(plan, cursor, {
            action,
            prompt,
            hint: line.hint ?? "",
            resetReplies: false,
            preparedNext: preparedNext || cursor.preparedNext,
          }),
          outcome: line.outcome,
        };
      }

      // Greeting path (or coding).
      const line = await askModel({
        section: greeting ? "Greeting" : currentSection,
        answer,
        asked: context.asked ?? "",
        plannedPrompt: greeting ? currentSeed : (nextSeedSafe || currentSeed),
        nextSection: nextName,
        currentPrompt: greeting ? "" : currentSeed,
        probeNote: greeting ? "" : plan.sections[cursor.sectionIndex]?.questions[0]?.followUpPrompt ?? "",
        company: context.company ?? "",
        role: context.role ?? "",
        experienceLevel: context.experienceLevel ?? "",
        persona: context.persona ?? "recruiter",
        practiceMode: context.practiceMode ?? "real",
        probes: replies,
        phase: greeting ? "greeting" : "reply",
        interviewType: context.interviewType ?? "",
        skills: context.skills ?? [],
        difficulty: context.difficulty ?? "",
        resume: context.resume ?? "",
        jobDescription: context.jobDescription ?? "",
        codeResult: context.codeResult ?? "",
        signals: context.signals ?? {},
        priorAnswer: prior,
        sectionElapsedMs: sectionElapsed,
        sectionBudgetMs: budget,
        allowStay: greeting ? replies < 1 : replies < 2,
      });
      let action: TurnAction = line.action === "advance" || line.action === "finish" ? line.action : "stay";
      if (greeting && overTime && action === "stay") {
        action = "advance";
      }
      if (coding && (cursor.replies ?? 0) >= 2 && action === "stay" && optedOut(answer)) {
        action = "advance";
      }
      let prompt = line.prompt;
      if (["technical", "coding", "system_design"].includes(kind) && isBehavioralScript(prompt)) {
        prompt = typeFallback(kind, greeting ? (nextName || "Background") : currentSection, context.role ?? "", context.company ?? "");
      }
      let preparedNext = cursor.preparedNext;
      if (action === "advance") {
        const seed = safeSeed(cursor.preparedNext || sectionSeed(plan, nextIndex) || "", kind) || prompt;
        const [spoken, background] = await Promise.all([
          greeting ? personalize(seed, nextName || plan.sections[0]?.name || "Next", answer, context, prior) : Promise.resolve(prompt),
          prepareBackground(plan, cursor, context, answer, prior),
        ]);
        if (greeting) {
          prompt = spoken;
        }
        preparedNext = background;
      } else if (!preparedNext) {
        preparedNext = await prepareBackground(plan, cursor, context, answer, prior);
      }
      return {
        ...nextTurn(plan, cursor, {action, prompt, hint: line.hint ?? "", preparedNext}),
        outcome: line.outcome,
      };
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
        section: "Greeting",
        answer: "",
        asked: topic,
        plannedPrompt: topic,
        phase: "greeting",
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
    const paused=Math.max(0, context.signals?.pausedMs ?? 0);
    const elapsed=session.startedAt ? Date.now() - Date.parse(session.startedAt) - paused : null;
    const timeForClose=duration === WRAP_UP_MINUTES && elapsed !== null && elapsed >= duration * 60 * 1000 - WRAP_UP_RESERVE_MS;
    if(duration === WRAP_UP_MINUTES && (timeForClose || result.turn.done)){
        const now=Date.now();
        const budgetEnd=session.startedAt ? Date.parse(session.startedAt) + WRAP_UP_MINUTES * 60 * 1000 + paused : now + WRAP_UP_RESERVE_MS;
        session.wrapUpUntil=new Date(Math.max(budgetEnd, now + WRAP_UP_RESERVE_MS)).toISOString();
        return session.applyAnswer(answer, wrapUpTurn(session.cursor), deliveryFrom());
    }
    return session.applyAnswer(answer, result, deliveryFrom());
}
