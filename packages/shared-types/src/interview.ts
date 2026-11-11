export type InterviewMode = "job" | "skill";
export type InterviewType=
 | "coding"
 | "technical"
 | "behavioral"
 | "system_design"
 | "hr"
 | "mixed";

export type ExperienceLevel = "entry" | "mid" | "senior";

export type Difficulty = "easy" | "medium" | "hard";
export type JobContent={
    company: string;
    role: string;
    description: string;
    url?: string;
};
export type InterviewStatus= "draft" | "preparing" | "ready" | "live" | "completed" | "report_ready" | "failed";
export type SessionEvent="prepare"| "plan_ready" | "start"| "end" | "report_ready" | "fail";

export type InterviewConfiguration={
    mode: InterviewMode;
    interviewType: InterviewType;
    experienceLevel: ExperienceLevel;
    difficulty: Difficulty;
    durationMinutes: number;
    skills: string[];
    focusAreas: string[];
    round?: string;
    job?: JobContent;
}