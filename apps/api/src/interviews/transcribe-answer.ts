import { spawn } from "node:child_process";
import { join } from "node:path";

export function transcribeAnswer(body: { audio: string; mime?: string; hint?: string; question?: string; resume?: string; skills?: string }): Promise<{ text: string; error: string }> {
    const serviceDir = join(__dirname, "..", "..", "..", "ai-service");
    const empty = { text: "", error: "Whisper could not transcribe the recording." };
    return new Promise((resolve) => {
        const child = spawn("python", ["transcribe_speech.py"], { cwd: serviceDir });
        let stdout = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.on("error", () => resolve(empty));
        child.on("close", (code) => {
            if (code !== 0) {
                resolve(empty);
                return;
            }
            try {
                const parsed = JSON.parse(stdout) as { text?: string; error?: string };
                resolve({ text: parsed.text?.trim() || "", error: parsed.error?.trim() || "" });
            } catch {
                resolve(empty);
            }
        });
        child.stdin.write(JSON.stringify(body));
        child.stdin.end();
    });
}
