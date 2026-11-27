import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toInterviewConfiguration } from "./configuration.ts";
import { InterviewSession } from "./interview-session.ts";
import { SqliteSessionStore } from "./sqlite-session-store.ts";

const directory = mkdtempSync(join(tmpdir(), "practice-room-"));
const filePath = join(directory, "sessions.sqlite");
const importPath = join(directory, "sessions.json");
const session = InterviewSession.create(toInterviewConfiguration({
  mode: "skill",
  skills: ["React"],
  interviewType: "technical",
  experienceLevel: "entry",
  difficulty: "medium",
  durationMinutes: 45,
}));
writeFileSync(importPath, JSON.stringify({ "imported-1": session.toRecord() }));

const imported = new SqliteSessionStore(filePath, importPath);
assert.equal(imported.get("imported-1").interviewType, "technical");
imported.save("interview-1", session);
const reloaded = new SqliteSessionStore(filePath, importPath);
assert.equal(reloaded.list().length, 2);
assert.equal(reloaded.get("interview-1").status, "draft");
reloaded.delete("interview-1");
assert.throws(() => reloaded.get("interview-1"));
const afterDelete = new SqliteSessionStore(filePath, importPath);
assert.equal(afterDelete.get("imported-1").status, "draft");
assert.throws(() => afterDelete.get("interview-1"));
const owned = InterviewSession.create(toInterviewConfiguration({
  mode: "skill",
  skills: ["React"],
  interviewType: "technical",
  experienceLevel: "entry",
  difficulty: "medium",
  durationMinutes: 45,
}));
owned.assignOwner("user-a");
afterDelete.save("owned", owned);
assert.equal(afterDelete.listOwned("user-a").length, 1);
assert.equal(afterDelete.listOwned("user-b").length, 0);
afterDelete.claimUnowned("user-b");
assert.equal(afterDelete.get("imported-1").ownerId, "user-b");
assert.throws(() => afterDelete.getOwned("owned", "user-b"));
console.log("sqlite session store ok");
