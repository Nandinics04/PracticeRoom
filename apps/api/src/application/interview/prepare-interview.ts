import type {InterviewConfiguration} from "@practice-room/shared-types";
import { InterviewSession } from "../../interviews/interview-session";
import {buildInterviewPlan} from "../../interviews/plan";
import {runPublicResearch} from "../../interviews/research-service";
import type {SearchProvider} from "../../interviews/search-provider";

export async function prepareInterview(config: InterviewConfiguration, provider: SearchProvider): Promise<InterviewSession>{
    const session=InterviewSession.create(config);
    const sources=await runPublicResearch(config, provider);
    session.ready(buildInterviewPlan(config,sources));
    return session;
}