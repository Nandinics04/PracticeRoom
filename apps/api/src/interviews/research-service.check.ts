import assert from "node:assert/strict";
import { toInterviewConfiguration } from "./configuration.ts";
import { runPublicResearch } from "./research-service.ts";
import { MockSearchProvider } from "./search-provider.ts";
import type { SearchProvider } from "./search-provider.ts";

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

async function main() {
const all = await runPublicResearch(job, new MockSearchProvider());
assert.equal(all.length, 14);

const flaky: SearchProvider = {
  async search(query) {
    if (query.platform === "reddit") throw new Error("reddit is down");
    return new MockSearchProvider().search(query);
  },
};
const partial = await runPublicResearch(job, flaky);
assert.equal(partial.length, 13);
assert.equal(partial.some((source) => source.platform === "reddit"), false);

const sameUrl: SearchProvider = {
  async search(query) {
    return [{ platform: query.platform, title: "t", url: "https://example.com/same", excerpt: "e" }];
  },
};
const deduped = await runPublicResearch(job, sameUrl);
assert.equal(deduped.length, 1);

const skill = toInterviewConfiguration({
  mode: "skill",
  skills: ["React"],
  interviewType: "coding",
  experienceLevel: "mid",
  difficulty: "hard",
  durationMinutes: 30,
});
assert.deepEqual(await runPublicResearch(skill, new MockSearchProvider()), []);

const guided = toInterviewConfiguration({
  mode: "job",
  company: "Amazon",
  role: "SDE Intern",
  description: "Build reliable services.",
  interviewType: "technical",
  experienceLevel: "entry",
  difficulty: "medium",
  durationMinutes: 45,
  materials: "https://leetcode.com/discuss/post/8428320/example Focus on arrays and two pointers.",
});
const guidedSources = await runPublicResearch(guided, new MockSearchProvider());
assert.equal(guidedSources.length, 1);
assert.equal(guidedSources[0].platform, "supplied");

console.log("public research service ok");
}
main();