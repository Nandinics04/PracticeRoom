import assert from "node:assert/strict";
import {interviewStrategyFor} from "./interview-strategy.ts";

assert.deepEqual(interviewStrategyFor("coding").sectionNames(),["Problem solving", "Implementation", "Complexity"]);
assert.deepEqual(interviewStrategyFor("technical").sectionNames(),["Background", "Core concepts", "Follow-ups"]);
assert.deepEqual(interviewStrategyFor("behavioral").sectionNames(),["Introduction", "Past experience", "Reflection"]);

assert.equal(
    interviewStrategyFor("coding").followUp("Complexity"),
    "Walk through Complexity, then give the time complexity",
  );

console.log("interview strategy ok");