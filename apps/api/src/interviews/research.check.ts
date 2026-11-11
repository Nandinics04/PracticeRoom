import assert from "node:assert/strict";
import { toInterviewConfiguration } from "./configuration.ts";
import { buildResearchQueries, mockFetchPublicPages } from "./research.ts";

const job = toInterviewConfiguration({
  mode: "job",
  company: "Google",
  role: "Software Engineer",
  description: "Build reliable services.",
  interviewType: "technical",
  experienceLevel: "entry",
  difficulty: "medium",
  durationMinutes: 45,
});

const queries = buildResearchQueries(job);
assert.equal(
  queries.find((item) => item.platform === "reddit")?.query,
  "Google Software Engineer interview experience site:reddit.com",
);
assert.equal(
  queries.find((item) => item.platform === "geeksforgeeks")?.query,
  "Google Software Engineer interview experience site:geeksforgeeks.org",
);


const pages = mockFetchPublicPages(queries);
assert.equal(pages.every((page) => page.url.startsWith("https://")), true);

const skill = toInterviewConfiguration({
  mode: "skill",
  skills: ["React"],
  interviewType: "coding",
  experienceLevel: "mid",
  difficulty: "hard",
  durationMinutes: 30,
});

assert.deepEqual(buildResearchQueries(skill), []);

console.log("public research queries ok");