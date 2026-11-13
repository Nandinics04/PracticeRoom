import assert from "node:assert/strict";
import {buildFeedback} from "./feedback.ts";

const short=buildFeedback([{sectionName: "Background", prompt: "Tell me about your project", answer: "too short"}]);
assert.equal(short.overallScore, 40);
assert.equal(short.criteria[0].confidence, "low");
assert.equal(short.criteria[0].evidence, "too short");
assert.deepEqual(short.practiceTopics, ["Background"]);

const longAnswer = "React stores component state and rerenders when that state changes.";
const strong = buildFeedback([
  { sectionName: "Core concepts", prompt: "Explain state.", answer: longAnswer },
]);

assert.equal(strong.overallScore, 80);
assert.equal(strong.criteria.every((criterion)=>criterion.confidence==="high"), true);
assert.deepEqual(strong.improvements, []);
assert.throws(() => buildFeedback([
    { sectionName: "Background", prompt: "Tell me about a project.", answer: "   " },
  ]));
console.log("interview feedback ok");