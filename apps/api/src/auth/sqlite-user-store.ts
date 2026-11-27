import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PracticeAccount } from "@practice-room/shared-types";
import { EmailAlreadyUsed, type AccountProfile, type NewAccount, type UserRepository } from "./user-repository";

const SESSION_DAYS = 14;

type UserRow = {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    target_role: string;
    experience_level: string;
    interview_type: string;
    goal: string;
};

export class SqliteUserStore implements UserRepository {
    private readonly db: DatabaseSync;

    constructor(filePath = join(process.cwd(), "data", "sessions.sqlite")) {
        mkdirSync(dirname(filePath), { recursive: true });
        this.db = new DatabaseSync(filePath);
        this.db.exec("PRAGMA journal_mode = WAL");
        this.db.exec(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            target_role TEXT NOT NULL DEFAULT '',
            experience_level TEXT NOT NULL DEFAULT '',
            interview_type TEXT NOT NULL DEFAULT '',
            goal TEXT NOT NULL DEFAULT ''
        )`);
        try {
            this.db.exec("ALTER TABLE users ADD COLUMN goal TEXT NOT NULL DEFAULT ''");
        } catch {
            // Accounts created after this column existed already have it.
        }
        this.db.exec(`CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        )`);
    }

    count(): number {
        const row = this.db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
        return row.count;
    }

    create(input: NewAccount): PracticeAccount {
        const email = input.email.trim().toLowerCase();
        const existing = this.db.prepare("SELECT id FROM users WHERE email = ?").get(email);
        if (existing) {
            throw new EmailAlreadyUsed();
        }
        const id = randomUUID();
        this.db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
            .run(id, input.name.trim(), email, hashPassword(input.password));
        return this.account(id);
    }

    authenticate(email: string, password: string): { account: PracticeAccount; token: string } | null {
        const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
        if (!row || !passwordMatches(password, row.password_hash)) {
            return null;
        }
        return { account: toAccount(row), token: this.openSession(row.id) };
    }

    openSession(userId: string): string {
        const token = randomUUID();
        const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
        this.db.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
            .run(digest(token), userId, expires);
        return token;
    }

    findByToken(token: string): PracticeAccount | null {
        const row = this.db.prepare(`SELECT users.* FROM auth_sessions
            JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?`)
            .get(digest(token), Date.now()) as UserRow | undefined;
        return row ? toAccount(row) : null;
    }

    revoke(token: string): void {
        this.db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(digest(token));
    }

    saveProfile(id: string, profile: AccountProfile): PracticeAccount {
        this.db.prepare("UPDATE users SET target_role = ?, experience_level = ?, goal = ? WHERE id = ?")
            .run(profile.targetRole.trim(), profile.experienceLevel, profile.goal, id);
        return this.account(id);
    }

    private account(id: string): PracticeAccount {
        const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
        return toAccount(row);
    }
}

function toAccount(row: UserRow): PracticeAccount {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        targetRole: row.target_role,
        experienceLevel: row.experience_level as PracticeAccount["experienceLevel"],
        goal: (row.goal ?? "") as PracticeAccount["goal"],
    };
}

function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 32).toString("hex");
    return `${salt}:${hash}`;
}

function passwordMatches(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) {
        return false;
    }
    const next = scryptSync(password, salt, 32);
    const current = Buffer.from(hash, "hex");
    if (next.length !== current.length) {
        return false;
    }
    return timingSafeEqual(next, current);
}

function digest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
