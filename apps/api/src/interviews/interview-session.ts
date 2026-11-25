import type { InterviewConfiguration, InterviewPlan, InterviewStatus, InterviewFeedback }  from "@practice-room/shared-types";
import {firstQuestion, type InterviewCursor, type InterviewTurn} from "./interviewer";
import { SessionStateMachine } from "./session-state";

export type TranscriptEntry={
    sectionName: string;
    prompt: string;
    answer: string;
};
export type SessionRecord = {
    status: InterviewStatus;
    plan: InterviewPlan | null;
    transcript: TranscriptEntry[];
    feedback: InterviewFeedback | null;
    cursor: InterviewCursor;
    config: InterviewConfiguration;
  };

export class InterviewSession{
    status: InterviewStatus="draft";
    plan: InterviewPlan | null= null;
    transcript: TranscriptEntry[]=[];
    feedback: InterviewFeedback | null = null;
    cursor: InterviewCursor={sectionIndex: 0, followUpUsed: false};
    private readonly machine=new SessionStateMachine();
    private readonly config: InterviewConfiguration;
    private constructor(config: InterviewConfiguration){
        this.config=config;
    }
    static create(config: InterviewConfiguration){
        return new InterviewSession(config);
    }
    ready(plan: InterviewPlan){
        this.status=this.machine.transition(this.status,"prepare");
        this.plan=plan;
        this.status=this.machine.transition(this.status,"plan_ready");
        return this.plan;
    }

    start(): InterviewTurn{
        if(!this.plan){
            throw new Error("Prepare the interview before starting")
        }
        this.status=this.machine.transition(this.status, "start");
        const turn=firstQuestion(this.plan);
        this.transcript.push({sectionName: turn.sectionName, prompt: turn.prompt, answer: ""});
        return turn;
    }

    applyAnswer(answer: string, result: { cursor: InterviewCursor; turn: InterviewTurn}):InterviewTurn{
        this.transcript[this.transcript.length-1].answer=answer;
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
        };
      }
      
      static fromRecord(record: SessionRecord): InterviewSession {
        const session = InterviewSession.create(record.config);
        session.status = record.status;
        session.plan = record.plan;
        session.transcript = record.transcript.map((entry) => ({ ...entry }));
        session.feedback = record.feedback;
        session.cursor = { ...record.cursor };
        return session;
      }
      
}


