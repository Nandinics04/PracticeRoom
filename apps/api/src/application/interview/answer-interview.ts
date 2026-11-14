import type { InterviewPlan} from "@practice-room/shared-types";
import type { InterviewSession } from "../../interviews/interview-session";
import {nextTurn, type InterviewCursor, type InterviewTurn} from "../../interviews/interviewer";


export interface AnswerEvaluator{
    evaluate(
        plan: InterviewPlan,
        cursor: InterviewCursor,
        answer: string,
    ): {cursor: InterviewCursor, turn: InterviewTurn};
}
export class MockAnswerEvaluator implements AnswerEvaluator{
    evaluate(plan: InterviewPlan, cursor: InterviewCursor, answer: string){
        return nextTurn(plan, cursor, answer);
    }
}

export function answerInterview(session: InterviewSession, answer: string, evaluator: AnswerEvaluator): InterviewTurn{
    if(session.status !== "live" || !session.plan){
        throw new Error("Interview is not live");
    }
    const result=evaluator.evaluate(session.plan, session.cursor, answer);
    return session.applyAnswer(answer, result);
}