import assert from "node:assert/strict";
import {toInterviewConfiguration} from "./configuration.ts";
import {buildInterviewPlan} from "./plan.ts";
import type {ResearchSource} from "@practice-rrom/shared-types";

const sources: ResearchSource[]=[
    {
        platform: "reddit",
        title: "Public experience",
        url: "https://reddit.com/example",
        excerpt: "Public preparation page.",
      },
      {
        platform: "geeksforgeeks",
        title: "Public experience",
        url: "https://geeksforgeeks.org/example",
        excerpt: "Public preparation page.",
      },
 
];

const job= toInterviewConfiguration({
    mode: "job",
    company: "Google",
    role: "Software Engineer",
    description: "Build reliable services.",
    interviewType: "technical",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 45,
});

const jobPlan=buildInterviewPlan(job, sources);
assert.equal(jobPlan.title, "Software Engineer at Google");
assert.equal(jobPlan.totalMinutes, 45);
assert.equal(jobPlan.sections.reduce((sum,section)=>sum+section.minutes,0),45);
assert.deepEqual(jobPlan.sections[0].questions[0].sourceUrls,[
    "https://reddit.com/example",
  "https://geeksforgeeks.org/example",
]);

const skill = toInterviewConfiguration({
    mode: "skill",
    skills: ["JavaScript", "React", "Node.js"],
    interviewType: "coding",
    experienceLevel: "entry",
    difficulty: "medium",
    durationMinutes: 40,
});

const skillPlan=buildInterviewPlan(skill, []);
assert.equal(skillPlan.title, "JavaScript, React, Node.js");
assert.equal(skillPlan.totalMinutes, 40);
assert.deepEqual(skillPlan.sourceUrls, []);
assert.deepEqual(skillPlan.sections.map((section)=> section.minutes), [13,13,14]);
console.log("interiew plan ok");