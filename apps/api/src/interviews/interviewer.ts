import type { InterviewPlan } from "@practice-room/shared-types";

export type InterviewCursor = {
    sectionIndex: number;
    followUpUsed: boolean;
    introduced?: boolean;
    replies?: number;
    wrapUp?: boolean;
    sectionStartedAt?: string;
    preparedNext?: string;
    compressedSummary?: string;
    rubricNotes?: string[];
}

export type StarStatus = {
    situation: boolean;
    task: boolean;
    action: boolean;
    result: boolean;
};

export type InterviewTurn = {
    sectionName: string;
    prompt: string;
    done: boolean;
    hint?: string;
    starStatus?: StarStatus;
}

export type TurnAction = "stay" | "advance" | "finish";

export function wrapUpTurn(cursor: InterviewCursor): { cursor: InterviewCursor; turn: InterviewTurn } {
    return {
        cursor: {
            sectionIndex: cursor.sectionIndex,
            followUpUsed: false,
            introduced: true,
            replies: 0,
            wrapUp: true,
            sectionStartedAt: new Date().toISOString(),
            preparedNext: cursor.preparedNext,
        },
        turn: {
            sectionName: "Wrap-up",
            prompt: "We're near the end of our time. Before we wrap up, what else should I know about your experience?",
            done: false,
            hint: "",
        },
    };
}

export function codingQuestion(plan: InterviewPlan): InterviewTurn {
    const section = plan.sections[0];
    const prompt = section?.questions[0]?.prompt?.trim();
    if (!section || !prompt) {
        throw new Error("Prepare the interview before starting");
    }
    return {
        sectionName: section.name,
        prompt,
        done: false,
    };
}

export function firstQuestion(plan: InterviewPlan): InterviewTurn {
    if (plan.sections.length === 0) {
        throw new Error("Prepare the interview before starting");
    }
    const topic = plan.title?.trim() || "this role";
    return {
        sectionName: "Introduction",
        prompt: `Hi, thanks for joining. I'll let you start us off for ${topic}. Say hello, tell me your name, and a little about yourself.`,
        done: false,
    };
}

export function nextTurn(
    plan: InterviewPlan,
    cursor: InterviewCursor,
    decision: {
        action: TurnAction;
        prompt: string;
        hint?: string;
        resetReplies?: boolean;
        preparedNext?: string;
        topicSummary?: string;
        rubricNote?: string;
        starStatus?: StarStatus;
    },
): { cursor: InterviewCursor; turn: InterviewTurn } {
    const nextSummary = decision.topicSummary
        ? [cursor.compressedSummary, decision.topicSummary].filter(Boolean).join(" | ").slice(-900)
        : cursor.compressedSummary;
    const nextNotes = decision.rubricNote
        ? [...(cursor.rubricNotes ?? []), decision.rubricNote].slice(-20)
        : cursor.rubricNotes;
    if (decision.action === "stay") {
        const sectionName = cursor.introduced === false ? "Introduction" : plan.sections[cursor.sectionIndex].name;
        const replies = decision.resetReplies ? 0 : (cursor.replies ?? 0) + 1;
        return {
            cursor: {
                sectionIndex: cursor.sectionIndex,
                followUpUsed: true,
                introduced: cursor.introduced === false ? false : true,
                replies,
                sectionStartedAt: cursor.sectionStartedAt ?? new Date().toISOString(),
                preparedNext: decision.preparedNext ?? cursor.preparedNext,
                compressedSummary: nextSummary,
                rubricNotes: nextNotes,
            },
            turn: {
                sectionName,
                prompt: decision.prompt,
                hint: decision.hint ?? "",
                done: false,
                ...(decision.starStatus ? { starStatus: decision.starStatus } : {}),
            },
        };
    }
    const leavingIntro = cursor.introduced === false;
    const nextIndex = leavingIntro ? 0 : cursor.sectionIndex + 1;
    if (decision.action === "finish" || (!leavingIntro && nextIndex >= plan.sections.length)) {
        const section = plan.sections[cursor.sectionIndex];
        return {
            cursor: {
                sectionIndex: cursor.sectionIndex,
                followUpUsed: false,
                introduced: true,
                replies: 0,
                sectionStartedAt: new Date().toISOString(),
                preparedNext: undefined,
                compressedSummary: nextSummary,
                rubricNotes: nextNotes,
            },
            turn: {
                sectionName: section.name,
                prompt: decision.prompt,
                hint: decision.hint ?? "",
                done: true,
                ...(decision.starStatus ? { starStatus: decision.starStatus } : {}),
            },
        };
    }
    const next = plan.sections[nextIndex];
    return {
        cursor: {
            sectionIndex: nextIndex,
            followUpUsed: false,
            introduced: true,
            replies: 0,
            sectionStartedAt: new Date().toISOString(),
            preparedNext: decision.preparedNext,
            compressedSummary: nextSummary,
            rubricNotes: nextNotes,
        },
        turn: {
            sectionName: next.name,
            prompt: decision.prompt,
            hint: decision.hint ?? "",
            done: false,
            ...(decision.starStatus ? { starStatus: decision.starStatus } : {}),
        },
    };
}
