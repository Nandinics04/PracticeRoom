import type { ExperienceLevel } from "./interview";

export type PracticeGoal = "this_week" | "campus" | "practice";

export type PracticeAccount = {
    id: string;
    name: string;
    email: string;
    targetRole: string;
    experienceLevel: ExperienceLevel | "";
    goal: PracticeGoal | "";
};
