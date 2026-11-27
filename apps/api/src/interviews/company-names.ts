import { spawn } from "node:child_process";
import { join } from "node:path";

let cached: string[] | null = null;

export function companyNames(): Promise<string[]> {
    if (cached) {
        return Promise.resolve(cached);
    }
    return new Promise((resolve) => {
        const child = spawn("python", ["company_names.py"], { cwd: join(__dirname, "..", "..", "..", "ai-service") });
        let stdout = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.on("error", () => resolve([]));
        child.on("close", (code) => {
            if (code !== 0) {
                resolve([]);
                return;
            }
            try {
                const names = JSON.parse(stdout) as string[];
                cached = names;
                resolve(names);
            } catch {
                resolve([]);
            }
        });
    });
}
