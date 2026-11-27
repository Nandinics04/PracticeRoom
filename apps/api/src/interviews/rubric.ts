import type {InterviewType} from "@practice-room/shared-types";

export type CompetencyRubric={
    competency: string;
    one: string;
    three: string;
    five: string;
};

const rubrics: Record<InterviewType, CompetencyRubric>={
    behavioral: {
        competency: "STAR completeness",
        one: "Names a situation and stops before their own action or a result.",
        three: "Describes what they personally did and a result.",
        five: "Situation, their action, a measured result, and what they would change.",
    },
    coding: {
        competency: "Solution and complexity",
        one: "States an idea with no walk-through and no complexity.",
        three: "Walks through the approach and names the time cost.",
        five: "Defends one choice in the code, the complexity, and an alternative they rejected.",
    },
    technical: {
        competency: "Depth of the concept",
        one: "Defines the term and gives no example.",
        three: "Explains the concept with an example from their work.",
        five: "Example, the limit of that approach, and why they kept it.",
    },
    system_design: {
        competency: "Design tradeoff",
        one: "Lists components with no requirement and no tradeoff.",
        three: "Ties the design to a requirement and names one tradeoff.",
        five: "Requirement, design, the option they rejected, and how it fails at higher scale.",
    },
    hr: {
        competency: "Specific motivation",
        one: "Gives a general preference with no example.",
        three: "Gives a reason tied to a piece of their experience.",
        five: "Reason, a concrete example, and what they want in the role.",
    },
    mixed: {
        competency: "Concrete example",
        one: "Stays general.",
        three: "Gives one example with their action.",
        five: "Example, result, and a limit.",
    },
};

export function rubricFor(interviewType: InterviewType): CompetencyRubric{
    return rubrics[interviewType];
}

export function rubricText(interviewType: InterviewType): string{
    const rubric=rubricFor(interviewType);
    return `${rubric.competency}. 1: ${rubric.one} 3: ${rubric.three} 5: ${rubric.five}`;
}

export function practiceBrief(input: {
    company?: string;
    role?: string;
    experienceLevel?: string;
    interviewType: InterviewType;
    description?: string;
}): string{
    const company=input.company?.trim() ?? "";
    const role=input.role?.trim() || "the role";
    const level=input.experienceLevel || "mid";
    const who=company ? `${role} at ${company}, ${level} level` : `${level} level`;
    const google=company.toLowerCase() === "google"
        ? " Google listens for how they frame constraints and tradeoffs, depth in this round, ownership of the outcome, and comfort with an unclear requirement."
        : "";
    return `Interview for ${who}. ${input.description?.trim() ?? ""} ${rubricText(input.interviewType)}.${google}`.replace(/\s+/g, " ").trim();
}
