import assert from "node:assert/strict";
import { SessionStore } from "./session-store.ts";
import { InterviewSession } from "./interview-session.ts";
import { toInterviewConfiguration } from "./configuration.ts";


const store=new SessionStore();
const session= InterviewSession.create(
    toInterviewConfiguration({
        mode: "skill",
      skills: ["React"],
      interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
    }),

);
store.save("interview-1", session);
assert.equal(store.get("interview-1")?.status, "draft");
assert.throws(() => store.get("missing"));
console.log("session store ok");