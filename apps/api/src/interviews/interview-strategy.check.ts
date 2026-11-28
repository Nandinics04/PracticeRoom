import assert from "node:assert/strict";
import {allocateMinutes, interviewStrategyFor} from "./interview-strategy.ts";

assert.deepEqual(interviewStrategyFor("coding").sectionNames(),["Problem solving", "Implementation", "Complexity"]);
assert.deepEqual(interviewStrategyFor("technical").sectionNames(),["Background", "Core concepts", "Follow-ups"]);
assert.deepEqual(interviewStrategyFor("behavioral").sectionNames(),["Warm-up & Pitch", "Resume Deep-Dive", "Core Competency Scenarios", "Culture Fit & Reverse Q&A"]);
assert.deepEqual(interviewStrategyFor("behavioral").sectionWeights(), [3, 8, 14, 5]);
assert.deepEqual(allocateMinutes(30, [3, 8, 14, 5]), [3, 8, 14, 5]);
assert.deepEqual(allocateMinutes(20, [3, 8, 14, 5]), [2, 5, 9, 4]);
assert.deepEqual(interviewStrategyFor("technical").sectionWeights(), [0.28, 0.44, 0.28]);
assert.ok(interviewStrategyFor("technical").introShare() > 0);
assert.equal(interviewStrategyFor("coding").introShare(), 0);

assert.equal(
    interviewStrategyFor("coding").followUp("Complexity"),
    "Walk through Complexity, then give the time complexity",
  );

console.log("interview strategy ok");
