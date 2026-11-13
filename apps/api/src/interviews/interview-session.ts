import type { InterviewConfiguration, InterviewPlan, InterviewStatus, InterviewFeedback }  from "@practice-room/shared-types";
import {firstQuestion, nextTurn, type InterviewCursor, type InterviewTurn} from "./interviewer.ts";
import {buildInterviewPlan} from "./plan.ts";
import { runPublicResearch } from "./research-service.ts";
import type { SearchProvider } from "./search-provider.ts";
import { SessionStateMachine } from "./session-state.ts";
import { buildFeedback } from "./feedback.ts";

export type TranscriptEntry={
    sectionName: string;
    prompt: string;
    answer: string;
};

export class InterviewSession{
    status: InterviewStatus="draft";
    plan: InterviewPlan | null= null;
    transcript: TranscriptEntry[]=[];
    private cursor: InterviewCursor={sectionIndex: 0, followUpUsed: false};
    private readonly machine=new SessionStateMachine();
    private readonly config: InterviewConfiguration;
    private constructor(config: InterviewConfiguration){
        this.config=config;
    }
    static create(config: InterviewConfiguration){
        return new InterviewSession(config);
    }
    async prepare(provider: SearchProvider){
        this.status=this.machine.transition(this.status, "prepare");
        const sources=await runPublicResearch(this.config, provider);
        this.plan=buildInterviewPlan(this.config, sources);
        this.status=this.machine.transition(this.status, "plan_ready");
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

    answer(answer: string): InterviewTurn{
        if(this.status!=="live" || !this.plan){
            throw new Error("The interview is not live");
        }
        this.transcript[this.transcript.length-1].answer=answer;
        const result=nextTurn(this.plan, this.cursor, answer);
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

    report(): InterviewFeedback{
        if(this.status!=="completed"){
            throw new Error("Finish the interview before generating a report")
        }
        const feedback=buildFeedback(this.transcript);
        this.status=this.machine.transition(this.status, "report_ready");
        return feedback;
    }
}


