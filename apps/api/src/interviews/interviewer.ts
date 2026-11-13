import type {InterviewPlan} from "@practice-room/shared-types";

export type InterviewCursor={
    sectionIndex: number;
    followUpUsed: boolean;
}
export type InterviewTurn={
    sectionName: string;
    prompt: string;
    done: boolean;
};

const shortAnswerLimit=40;

export function firstQuestion(plan: InterviewPlan): InterviewTurn {
    const section=plan.sections[0];
    return{
        sectionName: section.name,
        prompt: section.questions[0].prompt,
        done: false,
    };
}
export function nextTurn(
    plan: InterviewPlan,
    cursor: InterviewCursor,
    answer: string,
): {cursor: InterviewCursor; turn: InterviewTurn}{
    const section=plan.sections[cursor.sectionIndex];
    const tooShort=answer.trim().length< shortAnswerLimit;

    if(tooShort && !cursor.followUpUsed){
        return{
            cursor: {sectionIndex: cursor.sectionIndex, followUpUsed: true},
            turn:{
                sectionName: section.name,
                prompt: section.questions[0].followUpPrompt ?? "",
                done: false,
            },
        };
    }
    const nextIndex=cursor.sectionIndex+1;
    if(nextIndex>=plan.sections.length){
        return{
            cursor: {sectionIndex: cursor.sectionIndex, followUpUsed: false},
            turn:{
                sectionName: section.name,
                prompt: "That completes the interview.",
                done: true,
            },
        };
    }
    const next=plan.sections[nextIndex];
    return{
        cursor: {sectionIndex: nextIndex, followUpUsed: false},
        turn: {
            sectionName: next.name,
            prompt: next.questions[0].prompt,
            done: false,
        },
    };
}