import { join } from "node:path";

/** SQLite directory — override with PRACTICE_ROOM_DATA_DIR for Docker volumes. */
export function sqliteDataDir(): string {
    return process.env.PRACTICE_ROOM_DATA_DIR?.trim() || join(process.cwd(), "data");
}

export function sqliteFile(name: string): string {
    return join(sqliteDataDir(), name);
}
