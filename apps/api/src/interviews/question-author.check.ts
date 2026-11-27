import assert from "node:assert/strict";
import { toInterviewConfiguration } from "./configuration.ts";
import { MockQuestionAuthor } from "./question-author.ts";

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
    const questions = await new MockQuestionAuthor().writeQuestions(config, []);
    assert.equal(questions.length, 3);
    assert.equal(questions[0].sectionName, "Background");
    assert.equal(
      questions[0].prompt,
      "Discuss background for Software Engineer at Google. Use the job requirements and the public preparation sources.",
    );
    console.log("question author ok");
  }
  main();