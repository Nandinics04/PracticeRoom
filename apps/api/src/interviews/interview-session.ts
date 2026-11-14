import type { InterviewConfiguration, InterviewPlan, InterviewStatus, InterviewFeedback }  from "@practice-room/shared-types";
import {firstQuestion, type InterviewCursor, type InterviewTurn} from "./interviewer";
import { SessionStateMachine } from "./session-state";

export type TranscriptEntry={
    sectionName: string;
    prompt: string;
    answer: string;
};

export class InterviewSession{
    status: InterviewStatus="draft";
    plan: InterviewPlan | null= null;
    transcript: TranscriptEntry[]=[];
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
        if(this.status!=="live" || !this.plan){
            throw new Error("The interview is not live");
        }
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

    markReportReady(): void{
        this.status=this.machine.transition(this.status, "report_ready"); 
    }
}


