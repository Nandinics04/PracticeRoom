import assert from "node:assert/strict";
import { toInterviewConfiguration } from "./configuration.ts";
import { McpQuestionAuthor } from "./question-author.ts";

const config = toInterviewConfiguration({
  mode: "job",
  company: "Google",
  role: "Software Engineer",
  description: "Build reliable services.",
  interviewType: "technical",
  experienceLevel: "mid",
  difficulty: "medium",
  durationMinutes: 30,
});

async function main() {
    const questions = await new McpQuestionAuthor().writeQuestions(config, []);
    assert.equal(questions[0].sectionName, "Background");
    assert.equal(questions[0].prompt.includes("Reported for"), false);
    assert.equal(questions[0].prompt.length > 40, true);
    console.log("mcp question author ok");

  }
  main();