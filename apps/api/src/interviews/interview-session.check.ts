import assert from "node:assert/strict";
import { toInterviewConfiguration } from "./configuration.ts";
import { InterviewSession } from "./interview-session.ts";
import { MockSearchProvider } from "./search-provider.ts";
import { prepareInterview } from "../application/interview/prepare-interview.ts";
import { reportInterview, MockReportGenerator } from "../application/interview/report-interview.ts";
import { answerInterview, MockAnswerEvaluator } from "../application/interview/answer-interview.ts";
import { MockQuestionAuthor } from "./question-author.ts";

async function main(){
const longAnswer = "React stores component state and rerenders when that state changes.";

const skillConfig = toInterviewConfiguration({
    mode: "skill",
    skills: ["React"],
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
  });
  const skillSession = await prepareInterview(skillConfig, new MockSearchProvider(), new MockQuestionAuthor());

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


const session = await prepareInterview(jobConfig, new MockSearchProvider(), new MockQuestionAuthor());
assert.equal(session.status, "ready")
assert.equal((session.plan?.sourceUrls.length ?? 0)>0, true);



const opening = session.start();
assert.equal(session.status, "live");
assert.equal(opening.sectionName, "Introduction");

const greeting = await answerInterview(session, "hello good morning", new MockAnswerEvaluator());
assert.equal(greeting.sectionName, "Introduction");
assert.equal(session.transcript[0].answer, "hello good morning");

const introduced = await answerInterview(session, "I am Nandini and I build backend services.", new MockAnswerEvaluator());
assert.equal(introduced.sectionName, "Background");

const followUp = await answerInterview(session, "too short", new MockAnswerEvaluator());
assert.equal(followUp.sectionName, "Background");

await answerInterview(session, longAnswer, new MockAnswerEvaluator());
await answerInterview(session, longAnswer, new MockAnswerEvaluator());
const finished = await answerInterview(session, longAnswer, new MockAnswerEvaluator());
assert.equal(finished.done, true);
assert.equal(session.status, "completed");
const feedback = await reportInterview(session, new MockReportGenerator());
assert.equal(session.status, "report_ready");
assert.equal(feedback.practiceTopics.includes("Background"), true);
const saved = await reportInterview(session, new MockReportGenerator());
assert.equal(saved.overallScore, feedback.overallScore);
await assert.rejects(() => answerInterview(session, longAnswer, new MockAnswerEvaluator()));


const restored = InterviewSession.fromRecord(session.toRecord());
assert.equal(restored.status, "report_ready");
assert.equal(restored.interviewType, "technical");
assert.equal(restored.transcript[0].answer, "hello good morning");

const brief = await prepareInterview(toInterviewConfiguration({
    mode: "skill",
    skills: ["React"],
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 10,
}), new MockSearchProvider(), new MockQuestionAuthor());
brief.start();
assert.ok(brief.startedAt);
brief.cursor = {sectionIndex: (brief.plan?.sections.length ?? 1) - 1, followUpUsed: false, introduced: true, replies: 0};
const wrapUp = await answerInterview(brief, longAnswer, new MockAnswerEvaluator());
assert.equal(wrapUp.sectionName, "Wrap-up");
assert.equal(wrapUp.done, false);
assert.equal(brief.status, "live");
const closed = await answerInterview(brief, "That is everything I wanted to add.", new MockAnswerEvaluator());
assert.equal(closed.done, true);
assert.equal(brief.status, "completed");

const timed = await prepareInterview(toInterviewConfiguration({
    mode: "skill",
    skills: ["React"],
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 10,
}), new MockSearchProvider(), new MockQuestionAuthor());
timed.start();
timed.startedAt = new Date(Date.now() - 9 * 60 * 1000).toISOString();
const late = await answerInterview(timed, "too short", new MockAnswerEvaluator());
assert.equal(late.sectionName, "Wrap-up");
assert.ok(timed.wrapUpUntil);
assert.ok(Date.parse(timed.wrapUpUntil) >= Date.now() + 60 * 1000);

console.log("interview session ok");
}
main();