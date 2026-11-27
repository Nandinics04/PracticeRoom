import type {InterviewPlan} from "@practice-room/shared-types";

export type InterviewCursor={
    sectionIndex: number;
    followUpUsed: boolean;
    introduced?: boolean;
    replies?: number;
    wrapUp?: boolean;
}

export type InterviewTurn={
    sectionName: string;
    prompt: string;
    done: boolean;
    hint?: string;
}

export type TurnAction="stay" | "advance" | "finish";

export function wrapUpTurn(cursor: InterviewCursor): {cursor: InterviewCursor; turn: InterviewTurn}{
    return {
        cursor: {
            sectionIndex: cursor.sectionIndex,
            followUpUsed: false,
            introduced: true,
            replies: 0,
            wrapUp: true,
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
    if(plan.sections.length === 0){
        throw new Error("Prepare the interview before starting");
    }
    const topic = plan.title?.trim() || "this role";
    return{
        sectionName: "Introduction",
        prompt: `Let's start with a short introduction for ${topic}. Tell me about a project you owned, and what your part in it was.`,
        done: false,
    };
}

export function nextTurn(
    plan: InterviewPlan,
    cursor: InterviewCursor,
    decision: {action: TurnAction; prompt: string; hint?: string},
): {cursor: InterviewCursor; turn: InterviewTurn}{
    if(decision.action === "stay"){
        const sectionName=cursor.introduced === false ? "Introduction" : plan.sections[cursor.sectionIndex].name;
        return{
            cursor: {
                sectionIndex: cursor.sectionIndex,
                followUpUsed: true,
                introduced: cursor.introduced === false ? false : true,
                replies: (cursor.replies ?? 0) + 1,
            },
            turn:{
                sectionName,
                prompt: decision.prompt,
                hint: decision.hint ?? "",
                done: false,
            },
        };
    }
    const leavingIntro=cursor.introduced === false;
    const nextIndex=leavingIntro ? 0 : cursor.sectionIndex + 1;
    if(decision.action === "finish" || (!leavingIntro && nextIndex >= plan.sections.length)){
        const section=plan.sections[cursor.sectionIndex];
        return{
            cursor: {sectionIndex: cursor.sectionIndex, followUpUsed: false, introduced: true, replies: 0},
            turn:{
                sectionName: section.name,
                prompt: decision.prompt,
                hint: decision.hint ?? "",
                done: true,
            },
        };
    }
    const next=plan.sections[nextIndex];
    return{
        cursor: {sectionIndex: nextIndex, followUpUsed: false, introduced: true, replies: 0},
        turn:{
            sectionName: next.name,
            prompt: decision.prompt,
            hint: decision.hint ?? "",
            done: false,
        },
    };
}
