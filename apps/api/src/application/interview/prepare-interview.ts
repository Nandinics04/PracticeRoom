import type {InterviewConfiguration} from "@practice-room/shared-types";
import { InterviewSession } from "../../interviews/interview-session";
import {buildInterviewPlan} from "../../interviews/plan";
import {runPublicResearch} from "../../interviews/research-service";
import type {SearchProvider} from "../../interviews/search-provider";
import type { QuestionAuthor } from "../../interviews/question-author";

export async function prepareInterview(
    config: InterviewConfiguration,
    provider: SearchProvider,
    author: QuestionAuthor,
  ): Promise<InterviewSession> {
    const session = InterviewSession.create(config);
    const sources = await runPublicResearch(config, provider);
    const questions = await author.writeQuestions(config, sources);
    session.ready(buildInterviewPlan(config, sources, questions));
    return session;
  }