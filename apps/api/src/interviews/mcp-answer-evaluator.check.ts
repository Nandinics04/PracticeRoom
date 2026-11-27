import assert from "node:assert/strict";
import { McpAnswerEvaluator } from "../application/interview/answer-interview.ts";

async function main() {
  if (!process.env.PRACTICE_ROOM_LLM_KEY) {
    console.log("mcp answer evaluator skipped");
    return;
  }
  const plan = {
    title: "Software Engineer at Google",
    totalMinutes: 30,
    sourceUrls: [],
    sections: [
      { name: "Background", minutes: 10, questions: [{ prompt: "Discuss background", rubric: "r", sourceUrls: [] }] },
      { name: "Core concepts", minutes: 10, questions: [{ prompt: "Discuss core", rubric: "r", sourceUrls: [] }] },
    ],
  };
  const result = await new McpAnswerEvaluator().evaluate(
    plan,
    { sectionIndex: 0, followUpUsed: false },
    "I designed a service and chose a cache to keep reads fast.",
  );
  assert.equal(result.turn.sectionName, "Background");
  assert.match(result.turn.prompt, /cache/);
  console.log("mcp answer evaluator ok");
}
main();