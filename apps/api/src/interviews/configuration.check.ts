import assert from "node:assert/strict";
import {toInterviewConfiguration} from "./configuration.ts";

const job = toInterviewConfiguration({
    mode: "job",
    company: "Google",
    role: "Software Engineer",
    description: "We are looking for a software engineer with a strong background in web development and a passion for building user-friendly interfaces.",
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
    focusAreas: ["SQL"],

})
assert.equal(job.mode, "job");
assert.equal(job.job?.company, "Google");
assert.deepEqual(job.skills, []);


const skill = toInterviewConfiguration({
    mode: "skill",
    skills: [" React ", "SQL"],
    interviewType: "coding",
    experienceLevel: "mid",
    difficulty: "hard",
    durationMinutes: 30,
  });

  assert.deepEqual(skill.skills, ["React", "SQL"]);
  assert.equal(skill.job, undefined);
  assert.throws(() =>
    toInterviewConfiguration({
      mode: "skill",
      skills: ["  "],
      interviewType: "hr",
      experienceLevel: "senior",
      difficulty: "easy",
      durationMinutes: 20,
    }),
  );
  console.log("configuration mapping ok");
