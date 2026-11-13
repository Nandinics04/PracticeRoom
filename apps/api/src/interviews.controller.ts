import {Body, Controller, Post} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JobInterviewInput, SkillInterviewInput } from "@practice-room/shared-types";
import { prepareInterview } from "./application/interview/prepare-interview";
import { toInterviewConfiguration } from "./interviews/configuration";
import { MockSearchProvider } from "./interviews/search-provider";
import { SessionStore } from "./interviews/session-store";



@Controller("interviews")
export class InterviewsController{
    constructor(private readonly store: SessionStore){}

    @Post()
    async create(@Body() body: JobInterviewInput | SkillInterviewInput): Promise<{id: string; status: string; title?: string}>{
        const session=await prepareInterview(toInterviewConfiguration(body), new MockSearchProvider());
        const id=randomUUID();
        this.store.save(id,session);
        return{
            id,
            status: session.status,
            title: session.plan?.title,
        };

    }
}