import type { InterviewConfiguration, InterviewPlan, InterviewStatus, InterviewFeedback }  from "@practice-room/shared-types";
import {codingQuestion, firstQuestion, type InterviewCursor, type InterviewTurn, type TurnAction} from "./interviewer";
import { SessionStateMachine } from "./session-state";

export type AnswerDelivery={
    fillers: number;
    words: number;
    elapsedMs: number;
    latencyMs: number;
    tabHidden: number;
    tabAwayMs?: number;
    faces: number | null;
};

export type TranscriptEntry={
    sectionName: string;
    prompt: string;
    answer: string;
    action?: TurnAction;
    outcome?: "polite_opt_out" | "conceptual_pass";
    delivery?: AnswerDelivery;
};
export type SessionRecord = {
    status: InterviewStatus;
    plan: InterviewPlan | null;
    transcript: TranscriptEntry[];
    feedback: InterviewFeedback | null;
    cursor: InterviewCursor;
    config: InterviewConfiguration;
    startedAt?: string | null;
    wrapUpUntil?: string | null;
    ownerId?: string | null;
  };

export class InterviewSession{
    status: InterviewStatus="draft";
    plan: InterviewPlan | null= null;
    transcript: TranscriptEntry[]=[];
    feedback: InterviewFeedback | null = null;
    cursor: InterviewCursor={sectionIndex: 0, followUpUsed: false, introduced: false, replies: 0};
    startedAt: string | null=null;
    wrapUpUntil: string | null=null;
    ownerId: string | null=null;
    private readonly machine=new SessionStateMachine();
    private readonly config: InterviewConfiguration;
    private constructor(config: InterviewConfiguration){
        this.config=config;
    }
    static create(config: InterviewConfiguration){
        return new InterviewSession(config);
    }
    assignOwner(ownerId: string){
        this.ownerId=ownerId;
    }
    ready(plan: InterviewPlan){
        this.status=this.machine.transition(this.status,"prepare");
        this.plan=plan;
        this.status=this.machine.transition(this.status,"plan_ready");
        return this.plan;
    }

    reviseOpening(prompt: string){
        if(this.transcript[0]){
            this.transcript[0].prompt=prompt;
        }
    }

    end(){
        this.status=this.machine.transition(this.status, "end");
    }

    start(): InterviewTurn{
        if(!this.plan){
            throw new Error("Prepare the interview before starting")
        }
        this.status=this.machine.transition(this.status, "start");
        if(!this.startedAt){
            this.startedAt=new Date().toISOString();
        }
        const coding=this.config.interviewType === "coding";
        const turn=coding ? codingQuestion(this.plan) : firstQuestion(this.plan);
        if(coding){
            this.cursor={sectionIndex: 0, followUpUsed: false, introduced: true, replies: 0};
        }
        this.transcript.push({sectionName: turn.sectionName, prompt: turn.prompt, answer: ""});
        return turn;
    }

    applyAnswer(answer: string, result: { cursor: InterviewCursor; turn: InterviewTurn; outcome?: TranscriptEntry["outcome"]}, delivery?: AnswerDelivery):InterviewTurn{
        const entry=this.transcript[this.transcript.length-1];
        const previousReplies=this.cursor.replies ?? 0;
        entry.answer=answer;
        entry.action=result.turn.done ? "finish" : (result.cursor.replies ?? 0) > previousReplies ? "stay" : "advance";
        if(result.outcome){
            entry.outcome=result.outcome;
        }
        if(delivery){
            entry.delivery=delivery;
        }
        this.cursor=result.cursor;
        if(result.turn.done){
            this.status=this.machine.transition(this.status, "end");
            return result.turn;
        }
        this.transcript.push({
            sectionName: result.turn.sectionName,
            prompt: result.turn.prompt,
            answer: "",
        });
        return result.turn;
    }

    markReportReady(feedback: InterviewFeedback): void{
        this.feedback=feedback;
        this.status=this.machine.transition(this.status, "report_ready"); 
    }
    get interviewType() {
        return this.config.interviewType;
    }
    toRecord(): SessionRecord {
        return {
          status: this.status,
          plan: this.plan,
          transcript: this.transcript,
          feedback: this.feedback,
            cursor: this.cursor,
            config: this.config,
            startedAt: this.startedAt,
            wrapUpUntil: this.wrapUpUntil,
            ownerId: this.ownerId,
        };
      }
      
      static fromRecord(record: SessionRecord): InterviewSession {
        const session = InterviewSession.create(record.config);
        session.status = record.status;
        session.plan = record.plan;
        session.transcript = record.transcript.map((entry) => ({ ...entry }));
        session.feedback = record.feedback;
        session.cursor = { ...record.cursor };
        session.startedAt = record.startedAt ?? null;
        session.wrapUpUntil = record.wrapUpUntil ?? null;
        session.ownerId = record.ownerId ?? null;
        return session;
      }
      
}


