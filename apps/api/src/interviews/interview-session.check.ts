import assert from "node:assert/strict";
import { toInterviewConfiguration } from "./configuration.ts";
import { InterviewSession } from "./interview-session.ts";
import { MockSearchProvider } from "./search-provider.ts";

const longAnswer = "React stores component state and rerenders when that state changes.";

const skill = await InterviewSession.create(
  toInterviewConfiguration({
    mode: "skill",
    skills: ["React"],
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
  }),
).prepare(new MockSearchProvider());

assert.equal(skill.sourceUrls.length, 0);

const session = InterviewSession.create(
  toInterviewConfiguration({
    mode: "job",
    company: "Google",
    role: "Software Engineer",
    description: "Build reliable services.",
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
  }),
);

assert.throws(() => session.start());
const plan = await session.prepare(new MockSearchProvider());
assert.equal(session.status, "ready");
assert.equal(plan.sourceUrls.length > 0, true);

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
assert.equal(session.status, "completed");
assert.throws(() => session.answer(longAnswer));

console.log("interview session ok");