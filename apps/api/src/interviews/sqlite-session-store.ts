import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NotFoundException } from "@nestjs/common";
import { InterviewSession, type SessionRecord } from "./interview-session";
import { summarizeInterview } from "./interview-summary";
import type { SessionRepository } from "./session-repository";

export class SqliteSessionStore implements SessionRepository {
  private readonly db: DatabaseSync;

  constructor(
    private readonly filePath = join(process.cwd(), "data", "sessions.sqlite"),
    private readonly importPath = join(process.cwd(), "data", "sessions.json"),
  ) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, record TEXT NOT NULL)");
    this.importExistingFile();
  }

  save(id: string, session: InterviewSession): void {
    this.db.prepare("INSERT INTO sessions (id, record) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record")
      .run(id, JSON.stringify(session.toRecord()));
  }

  get(id: string): InterviewSession {
    const row = this.db.prepare("SELECT record FROM sessions WHERE id = ?").get(id) as { record?: string } | undefined;
    if (!row?.record) {
      throw new NotFoundException(`Interview ${id} was not found`);
    }
    return InterviewSession.fromRecord(JSON.parse(row.record) as SessionRecord);
  }

  list() {
    return this.rows().map((row) => summarizeInterview(row.id, row.session));
  }

  listOwned(ownerId: string) {
    return this.rows()
      .filter((row) => row.session.ownerId === ownerId)
      .map((row) => summarizeInterview(row.id, row.session));
  }

  getOwned(id: string, ownerId: string): InterviewSession {
    const session = this.get(id);
    if (session.ownerId !== ownerId) {
      throw new NotFoundException(`Interview ${id} was not found`);
    }
    return session;
  }

  claimUnowned(ownerId: string): void {
    const update = this.db.prepare("UPDATE sessions SET record = ? WHERE id = ?");
    for (const row of this.rows()) {
      if (row.session.ownerId) {
        continue;
      }
      row.session.assignOwner(ownerId);
      update.run(JSON.stringify(row.session.toRecord()), row.id);
    }
  }

  private rows() {
    const saved = this.db.prepare("SELECT id, record FROM sessions").all() as { id: string; record: string }[];
    return saved.map((row) => ({
      id: row.id,
      session: InterviewSession.fromRecord(JSON.parse(row.record) as SessionRecord),
    }));
  }

  delete(id: string): void {
    const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id) as { changes?: number };
    if (!result.changes) {
      throw new NotFoundException(`Interview ${id} was not found`);
    }
  }

  private importExistingFile(): void {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    if (count.count > 0 || !existsSync(this.importPath)) {
      return;
    }
    let saved: Record<string, SessionRecord>;
    try {
      saved = JSON.parse(readFileSync(this.importPath, "utf8")) as Record<string, SessionRecord>;
    } catch {
      return;
    }
    const entries = Object.entries(saved);
    if (entries.length === 0) {
      return;
    }
    const insert = this.db.prepare("INSERT INTO sessions (id, record) VALUES (?, ?)");
    this.db.exec("BEGIN");
    try {
      for (const [id, record] of entries) {
        insert.run(id, JSON.stringify(record));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
