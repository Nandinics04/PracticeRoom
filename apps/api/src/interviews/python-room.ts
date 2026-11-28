import { Injectable, type OnModuleInit } from "@nestjs/common";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";

type RoomOp = "ready" | "prepare" | "reply" | "transcribe" | "repair";

type Waiter = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
};

let child: ChildProcessWithoutNullStreams | null = null;
let buffer = "";
let nextId = 1;
const pending = new Map<number, Waiter>();

function serviceDir() {
    const fromEnv = process.env.PRACTICE_ROOM_AI_SERVICE?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    return join(__dirname, "..", "..", "..", "ai-service");
}

function failPending(message: string) {
    for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(message));
    }
    pending.clear();
    buffer = "";
}

function ensureWorker() {
    if (child && child.exitCode === null && !child.killed) {
        return child;
    }
    const proc = spawn("python", ["-u", "room_worker.py"], { cwd: serviceDir() });
    child = proc;
    proc.stdout.setEncoding("utf8");
    proc.stderr.on("data", () => undefined);
    proc.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!line) {
                continue;
            }
            let message: { id?: number; ok?: boolean; result?: unknown; error?: string };
            try {
                message = JSON.parse(line) as { id?: number; ok?: boolean; result?: unknown; error?: string };
            } catch {
                continue;
            }
            if (message.id == null) {
                continue;
            }
            const waiter = pending.get(message.id);
            if (!waiter) {
                continue;
            }
            clearTimeout(waiter.timer);
            pending.delete(message.id);
            if (message.ok) {
                waiter.resolve(message.result);
            } else {
                waiter.reject(new Error(message.error || "The interviewer could not answer."));
            }
        }
    });
    proc.on("exit", () => {
        if (child === proc) {
            child = null;
            failPending("The interviewer restarted. Try that again.");
        }
    });
    return proc;
}

export function callRoom<T>(op: RoomOp, payload: unknown, timeoutMs: number): Promise<T> {
    const proc = ensureWorker();
    const id = nextId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error("That took too long. Try again."));
        }, timeoutMs);
        pending.set(id, {
            resolve: resolve as (value: unknown) => void,
            reject,
            timer,
        });
        proc.stdin.write(`${JSON.stringify({ id, op, payload })}\n`);
    });
}

@Injectable()
export class PythonRoom implements OnModuleInit {
    onModuleInit() {
        void callRoom("ready", {}, 20000).catch(() => undefined);
    }
}
