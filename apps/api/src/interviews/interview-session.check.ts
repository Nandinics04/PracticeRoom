import assert from "node:assert/strict";
import { toInterviewConfiguration } from "./configuration.ts";
import { InterviewSession } from "./interview-session.ts";
import { MockSearchProvider } from "./search-provider.ts";
import { prepareInterview } from "../application/interview/prepare-interview.ts";


const longAnswer = "React stores component state and rerenders when that state changes.";

const skillConfig = toInterviewConfiguration({
    mode: "skill",
    skills: ["React"],
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
  });
const skillSession=await prepareInterview(skillConfig,  new MockSearchProvider());
assert.equal(skillSession.status, "ready");
assert.equal(skillSession.plan?.sourceUrls.length, 0);

const jobConfig =  toInterviewConfiguration({
    mode: "job",
    company: "Google",
    role: "Software Engineer",
    description: "Build reliable services.",
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
  });
const unprepared=InterviewSession.create(jobConfig);
assert.throws(() => unprepared.start());


const session=await prepareInterview(jobConfig, new MockSearchProvider());
assert.equal(session.status, "ready")
assert.equal((session.plan?.sourceUrls.length ?? 0)>0, true);



const opening = session.start();
assert.equal(session.status, "live");
assert.equal(opening.sectionName, "Background");

const followUp = session.answer("too short");
assert.equal(followUp.sectionName, "Background");
assert.equal(session.transcript[0].answer, "too short");

session.answer(longAnswer);
session.answer(longAnswer);
const finished = session.answer(longAnswer);
assert.equal(finished.done, true);
assert.equal(session.status, "completed");const feedback = session.report();
assert.equal(session.status, "report_ready");
assert.equal(feedback.practiceTopics.includes("Background"), true);
assert.throws(() => session.report());
assert.throws(() => session.answer(longAnswer));



console.log("interview session ok");