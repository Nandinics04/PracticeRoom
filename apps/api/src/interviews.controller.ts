import {Body, Controller, Post, Param} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JobInterviewInput, SkillInterviewInput } from "@practice-room/shared-types";
import { prepareInterview } from "./application/interview/prepare-interview";
import { toInterviewConfiguration } from "./interviews/configuration";
import { MockSearchProvider } from "./interviews/search-provider";
import { SessionStore } from "./interviews/session-store";
import { reportInterview, MockReportGenerator } from "./application/interview/report-interview";
import { answerInterview, MockAnswerEvaluator } from "./application/interview/answer-interview";



@Controller("interviews")
export class InterviewsController{
    constructor(private readonly store: SessionStore){}

    @Post()
    async create(@Body() body: JobInterviewInput | SkillInterviewInput): Promise<{id: string; status: string; title?: string}>{
        const session=await prepareInterview(toInterviewConfiguration(body), new MockSearchProvider());
        const id="123";
        this.store.save(id,session);
        return{
            id,
            status: session.status,
            title: session.plan?.title,
        };
    }
    @Post(":id/start")
    async start(@Param("id") id: string){
        const session=this.store.get(id);
        const turn = session?.start();
        return{
            status: session?.status,
            sectionName: turn?.sectionName,
            prompt: turn?.prompt,
            done: turn?.done,
        }
    }
    @Post(":id/answer")
    async answer(@Param("id") id: string, @Body() body: {answer: string}){
        const session=this.store.get(id);
        const turn = answerInterview(session, body.answer, new MockAnswerEvaluator());
        return{
            status: session?.status,
            sectionName: turn?.sectionName,
            prompt: turn?.prompt,
            done: turn?.done,
        }
    }
    @Post(":id/report")
    async report(@Param("id") id: string){
        const session=this.store.get(id);
        const feedback=reportInterview(session, new MockReportGenerator());
        return{
            status: session?.status,
            ...feedback,
        }

    }
}