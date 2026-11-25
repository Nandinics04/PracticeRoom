// import { Injectable } from "@nestjs/common";
import { InterviewSession } from "./interview-session";
import { NotFoundException } from "@nestjs/common";
import type { SessionRepository } from "./session-repository";

// @Injectable()
export class SessionStore implements SessionRepository{
    private readonly sessions=new Map<string, InterviewSession>();

     save(id: string, session: InterviewSession): void{
        this.sessions.set(id, session);
     }
     get(id:string): InterviewSession {
        const session=this.sessions.get(id);
        if(!session){
            throw new NotFoundException(`Interview ${id} was not found`);
        }
        return session;
     }
     list(): { id: string; status: string; title?: string; interviewType: string }[] {
      return [...this.sessions.entries()].map(([id, session]) => ({
        id,
        status: session.status,
        title: session.plan?.title,
        interviewType: session.interviewType,
      }));
    }
}