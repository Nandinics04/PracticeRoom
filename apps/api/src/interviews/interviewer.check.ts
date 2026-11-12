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
assert.equal(opening.sectionName, "Background");
assert.equal(opening.done, false);
const followUp = nextTurn(plan, { sectionIndex: 0, followUpUsed: false }, "too short");
assert.equal(followUp.cursor.followUpUsed, true);
assert.equal(followUp.cursor.sectionIndex, 0);
assert.equal(followUp.turn.sectionName, "Background");
const advance = nextTurn(plan, followUp.cursor, "still short");
assert.equal(advance.cursor.sectionIndex, 1);
assert.equal(advance.turn.sectionName, "Core concepts");
const longAnswer = "React stores state in components and rerenders when that state changes.";
const skippedFollowUp = nextTurn(plan, { sectionIndex: 1, followUpUsed: false }, longAnswer);
assert.equal(skippedFollowUp.cursor.sectionIndex, 2);
assert.equal(skippedFollowUp.turn.sectionName, "Follow-ups");
const finished = nextTurn(plan, skippedFollowUp.cursor, longAnswer);
assert.equal(finished.turn.done, true);
console.log("interviewer turns ok");
