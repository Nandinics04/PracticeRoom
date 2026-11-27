import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toInterviewConfiguration } from "./configuration.ts";
import { FileSessionStore } from "./file-session-store.ts";
import { InterviewSession } from "./interview-session.ts";

const filePath = join(mkdtempSync(join(tmpdir(), "practice-room-")), "sessions.json");
const session = InterviewSession.create(toInterviewConfiguration({
  mode: "skill",
  skills: ["React"],
  interviewType: "technical",
  experienceLevel: "entry",
  difficulty: "medium",
  durationMinutes: 45,
}));

const store = new FileSessionStore(filePath);
store.save("interview-1", session);

const reloaded = new FileSessionStore(filePath);
assert.equal(reloaded.get("interview-1").status, "draft");
assert.equal(reloaded.get("interview-1").interviewType, "technical");
assert.throws(() => reloaded.get("missing"));
reloaded.delete("interview-1");
assert.throws(() => reloaded.get("interview-1"));
const afterDelete = new FileSessionStore(filePath);
assert.throws(() => afterDelete.get("interview-1"));
console.log("file session store ok");