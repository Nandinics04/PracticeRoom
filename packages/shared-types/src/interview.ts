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
export type JobInterviewInput={
    mode: "job";
    company: string;
    role: string;
    description: string;
    url?:string;
    round?:string;
    interviewType: InterviewType;
    experienceLevel: ExperienceLevel;
    difficulty: Difficulty;
    durationMinutes: number;
    focusAreas?: string[];
};
export type SkillInterviewInput={
    mode: "skill";
    skills: string[];
    interviewType: InterviewType;
    experienceLevel: ExperienceLevel;
    difficulty: Difficulty;
    durationMinutes: number;
    focusAreas?: string[];
}
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

export type PublicPlatform="leetcode" | "glassdoor" | "geeksforgeeks"| "medium"| "reddit"| "linkedin" | "AmbitionBox" | "ziprecruiter" | "stackoverflow" | "github" | "IGotAnOffer" | "Blind"| "CareerCup" | "company_site";
export type ResearchSource={
    platform: PublicPlatform;
    title: string;
    url: string;
    excerpt: string;
};
export type ResearchQuery={
    platform: PublicPlatform;
    query: string;
}
export type PlanQuestion={
    prompt: string;
    rubric: string;
    sourceUrls: string[];
};
export type PlanSection={
    name: string;
    minutes: number;
    questions: PlanQuestion[];
};
export type InterviewPlan={
    title: string;
    totalMinutes: number;
    sections: PlanSection[];
    sourceUrls: string[];
};