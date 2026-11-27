import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NotFoundException } from "@nestjs/common";
import { InterviewSession, type SessionRecord } from "./interview-session";
import { summarizeInterview } from "./interview-summary";
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
    return [...this.sessions.entries()].map(([id, session]) => summarizeInterview(id, session));
  }

  listOwned(ownerId: string) {
    return this.list().filter((item) => this.sessions.get(item.id)?.ownerId === ownerId);
  }

  getOwned(id: string, ownerId: string): InterviewSession {
    const session = this.get(id);
    if (session.ownerId !== ownerId) {
      throw new NotFoundException(`Interview ${id} was not found`);
    }
    return session;
  }

  claimUnowned(ownerId: string): void {
    for (const session of this.sessions.values()) {
      if (!session.ownerId) {
        session.assignOwner(ownerId);
      }
    }
    this.persist();
  }

  delete(id: string): void {
    if (!this.sessions.has(id)) {
      throw new NotFoundException(`Interview ${id} was not found`);
    }
    this.sessions.delete(id);
    this.persist();
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