import { spawn } from "node:child_process";
import { join } from "node:path";

export function repairSpokenAnswer(body: {
    answer: string;
    question?: string;
    resume?: string;
    company?: string;
    role?: string;
    jobDescription?: string;
}): Promise<string> {
    const original = body.answer.trim();
    if (original.split(/\s+/).length < 8) {
        return Promise.resolve(original);
    }
    const serviceDir = join(__dirname, "..", "..", "..", "ai-service");
    return new Promise((resolve) => {
        const child = spawn("python", ["repair_answer.py"], { cwd: serviceDir });
        let stdout = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.on("error", () => resolve(original));
        child.on("close", (code) => {
            if (code !== 0) {
                resolve(original);
                return;
            }
            try {
                const parsed = JSON.parse(stdout) as { answer?: string };
                resolve(parsed.answer?.trim() || original);
            } catch {
                resolve(original);
            }
        });
        child.stdin.write(JSON.stringify(body));
        child.stdin.end();
    });
}
