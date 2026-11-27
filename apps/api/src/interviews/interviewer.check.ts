import assert from "node:assert/strict";
import {toInterviewConfiguration} from "./configuration.ts";
import {buildInterviewPlan} from "./plan.ts";
import {firstQuestion, nextTurn} from "./interviewer.ts";

const plan=buildInterviewPlan(
    toInterviewConfiguration({
        mode: "skill",
        skills: ["JavaScript", "React", "Node.js"],
        interviewType: "technical",
        experienceLevel: "entry",
        difficulty: "medium",
        durationMinutes: 45,
    }),
    [],
);

const opening=firstQuestion(plan);
assert.equal(opening.sectionName, "Introduction");
assert.equal(opening.done, false);
const cursor={sectionIndex: 0, followUpUsed: false, introduced: false, replies: 0};
const stay=nextTurn(plan, cursor, {action: "stay", prompt: "Tell me that again in your own words."});
assert.equal(stay.cursor.introduced, false);
assert.equal(stay.turn.sectionName, "Introduction");
assert.equal(stay.turn.prompt, "Tell me that again in your own words.");
const advance=nextTurn(plan, stay.cursor, {action: "advance", prompt: "Let's go into the work."});
assert.equal(advance.cursor.sectionIndex, 0);
assert.equal(advance.cursor.introduced, true);
assert.equal(advance.turn.sectionName, "Background");
const finished=nextTurn(plan, {sectionIndex: plan.sections.length - 1, followUpUsed: false, introduced: true, replies: 0}, {action: "advance", prompt: "That was the last part."});
assert.equal(finished.turn.done, true);
console.log("interviewer turns ok");
