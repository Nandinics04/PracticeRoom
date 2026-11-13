// import { Injectable } from "@nestjs/common";
import { InterviewSession } from "./interview-session";

// @Injectable()
export class SessionStore{
    private readonly sessions=new Map<string, InterviewSession>();

     save(id: string, session: InterviewSession): void{
        this.sessions.set(id, session);
     }
     get(id:string): InterviewSession | undefined{
        const session=this.sessions.get(id);
        if(!session){
            throw new Error(`Interview ${id} was not found`);
        }
        return session;
     }
}