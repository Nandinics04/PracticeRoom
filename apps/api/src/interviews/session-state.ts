import type { InterviewStatus, SessionEvent} from "@practice-room/shared-types";

const transitions: Record<InterviewStatus, Partial<Record<SessionEvent, InterviewStatus>>> = {
    draft: {prepare: "preparing"},
    preparing: {plan_ready: "ready", fail: "failed"},
    ready: {start: "live", fail: "failed"},
    live: {end: "completed", fail: "failed"},
    completed: {report_ready: "report_ready"},
    report_ready: {},
    failed: {},
};

export class SessionStateMachine{
    transition(from: InterviewStatus, event: SessionEvent): InterviewStatus{
        const next=transitions[from][event];
        if(!next){
            throw new Error(`Cannot ${event} while the interview is in ${from} state`);
        }
        return next;
    }
    
}