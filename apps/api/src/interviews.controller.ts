import {Body, Controller, Post, Param, Get} from "@nestjs/common";
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
    async create(@Body() body: JobInterviewInput | SkillInterviewInput): Promise<{id: string; status: string; title?: string,interviewType: string; sections: {name: string, minutes:number}[]; sourceUrls: string[]}>{
        const session=await prepareInterview(toInterviewConfiguration(body), new MockSearchProvider());
        const id=randomUUID();
        this.store.save(id,session);
        return{
            id,
            status: session.status,
            title: session.plan?.title,
            interviewType: session.interviewType,
            sections: session.plan?.sections.map((section)=>({
                name: section.name,
                minutes: section.minutes,
            })) ?? [],
            sourceUrls: session.plan?.sourceUrls ?? [],
        };
    }
    @Post(":id/start")
    async start(@Param("id") id: string){
        const session=this.store.get(id);
        const turn = session?.start();
        this.store.save(id, session);
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
    @Get()
    list() {
      return this.store.list();
    }
    @Get(":id")
    findOne(@Param("id") id: string){
        const session=this.store.get(id);
        const last=session.transcript.at(-1);
        return{
            id,
            status: session?.status,
            title: session.plan?.title,
            interviewType: session.interviewType,
            sections:
             session.plan?.sections.map((section)=>({
                name: section.name,
                minutes: section.minutes,
             })) ?? [],
             sourceUrls: session.plan?.sourceUrls ?? [],
             sectionName: last?.sectionName ?? "",
             prompt: last?.prompt ?? "",
             feedback: session.feedback,
             done: session.status==="completed" || session.status=="report_ready",
        };
    }
}