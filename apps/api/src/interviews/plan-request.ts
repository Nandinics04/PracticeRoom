import { spawn } from "node:child_process";
import { join } from "node:path";
import type { ExperienceLevel, InterviewType, InterviewerPersona, JobInterviewInput, PracticeMode, SkillInterviewInput } from "@practice-room/shared-types";

const interviewTypes: InterviewType[] = ["coding", "technical", "behavioral", "system_design", "hr", "mixed"];
const levels: ExperienceLevel[] = ["entry", "mid", "senior"];

type RequestBody = {
    request: string;
    persona?: InterviewerPersona;
    practiceMode?: PracticeMode;
    resume?: string;
    materials?: string;
};

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
    return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

export function planFromRequest(body: RequestBody): Promise<JobInterviewInput | SkillInterviewInput> {
    const serviceDir = join(__dirname, "..", "..", "..", "ai-service");
    return new Promise((resolve, reject) => {
        const child = spawn("python", ["plan_interview.py"], { cwd: serviceDir });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `plan_interview.py exited ${code}`));
                return;
            }
            const planned = JSON.parse(stdout) as Record<string, unknown>;
            const interviewType = oneOf(planned.interviewType, interviewTypes, "behavioral");
            const experienceLevel = oneOf(planned.experienceLevel, levels, "mid");
            const difficulty = oneOf(planned.difficulty, ["easy", "medium", "hard"] as const, "medium");
            const duration = Math.min(30, Math.max(15, Number(planned.durationMinutes) || 20));
            const shared = {
                interviewType,
                experienceLevel,
                difficulty,
                durationMinutes: duration,
                persona: body.persona,
                practiceMode: body.practiceMode,
                resume: body.resume,
                materials: body.materials,
            };
            const company = String(planned.company ?? "").trim();
            if (planned.mode === "skill" || !company) {
                const skills = Array.isArray(planned.skills) ? planned.skills.map((skill) => String(skill).trim()).filter(Boolean) : [];
                resolve({
                    mode: "skill",
                    skills: skills.length > 0 ? skills : [interviewType === "behavioral" ? "behavioral interviews" : "the skill you named"],
                    ...shared,
                });
                return;
            }
            resolve({
                mode: "job",
                company,
                role: String(planned.role ?? "").trim() || "Software Engineer",
                description: String(planned.description ?? "").trim() || `Practice ${interviewType} questions for ${company}.`,
                ...shared,
            });
        });
        child.stdin.write(JSON.stringify({ request: body.request }));
        child.stdin.end();
    });
}
