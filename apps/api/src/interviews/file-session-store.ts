import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { NotFoundException } from "@nestjs/common";
import { InterviewSession, type SessionRecord } from "./interview-session";
import type { SessionRepository } from "./session-repository";

export class FileSessionStore implements SessionRepository {
  private readonly sessions = new Map<string, InterviewSession>();

  constructor(private readonly filePath = join(process.cwd(), "data", "sessions.json")) {
    this.load();
  }

  save(id: string, session: InterviewSession): void {
    this.sessions.set(id, session);
    this.persist();
  }

  get(id: string): InterviewSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundException(`Interview ${id} was not found`);
    }
    return session;
  }

  list() {
    return [...this.sessions.entries()].map(([id, session]) => ({
      id,
      status: session.status,
      title: session.plan?.title,
      interviewType: session.interviewType,
    }));
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const saved = JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, SessionRecord>;
    for (const [id, record] of Object.entries(saved)) {
      this.sessions.set(id, InterviewSession.fromRecord(record));
    }
  }

  private persist(): void {
    const data: Record<string, SessionRecord> = {};
    for (const [id, session] of this.sessions) {
      data[id] = session.toRecord();
    }
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data));
  }
}