import type {InterviewConfiguration} from "@practice-room/shared-types";
import { InterviewSession } from "../../interviews/interview-session.ts";
import {buildInterviewPlan} from "../../interviews/plan.ts";
import {runPublicResearch} from "../../interviews/research-service.ts";
import type {SearchProvider} from "../../interviews/search-provider.ts";

export async function prepareInterview(config: InterviewConfiguration, provider: SearchProvider): Promise<InterviewSession>{
    const session=InterviewSession.create(config);
    const sources=await runPublicResearch(config, provider);
    session.ready(buildInterviewPlan(config,sources));
    return session;

}