// import { Injectable } from "@nestjs/common";
import { InterviewSession } from "./interview-session";
import { NotFoundException } from "@nestjs/common";
import { summarizeInterview } from "./interview-summary";
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
     list() {
      return [...this.sessions.entries()].map(([id, session]) => summarizeInterview(id, session));
    }
    listOwned(ownerId: string) {
      return this.list().filter((item) => this.sessions.get(item.id)?.ownerId === ownerId);
    }
    getOwned(id: string, ownerId: string): InterviewSession {
      const session = this.get(id);
      if (session.ownerId !== ownerId) {
        throw new NotFoundException(`Interview ${id} was not found`);
      }
      return session;
    }
    claimUnowned(ownerId: string): void {
      for (const session of this.sessions.values()) {
        if (!session.ownerId) {
          session.assignOwner(ownerId);
        }
      }
    }
    delete(id: string): void {
        if (!this.sessions.has(id)) {
            throw new NotFoundException(`Interview ${id} was not found`);
        }
        this.sessions.delete(id);
    }
}