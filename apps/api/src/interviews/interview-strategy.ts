import type {InterviewType} from "@practice-room/shared-types";

export interface InterviewStrategy{
    sectionNames(): string[];
    sectionWeights(): number[];
    introShare(): number;
    followUp(sectionName: string): string;
}

function equalWeights(count: number): number[] {
    return Array.from({ length: count }, () => 1);
}

class CodingStrategy implements InterviewStrategy{
     sectionNames(): string[]{
        return ["Problem solving", "Implementation", "Complexity"];
     }
     sectionWeights(): number[]{
        return equalWeights(3);
     }
     introShare(): number{
        return 0;
     }
     followUp(sectionName: string): string{
        return `Walk through ${sectionName}, then give the time complexity`;
     }
}
class TechnicalStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Background", "Core concepts", "Follow-ups"];
    }
    sectionWeights(): number[]{
        // Core concepts carries most of the round: fundamentals and communication under load.
        return [0.28, 0.44, 0.28];
    }
    introShare(): number{
        return 0.08;
    }
    followUp(sectionName: string): string{
        if (sectionName === "Background") {
            return "Claim to test: they explain one tradeoff or failure mode in that system, not only the happy path.";
        }
        if (sectionName === "Core concepts") {
            return "Claim to test: they can reason about cost or an applied case, not only a definition.";
        }
        return "Claim to test: they meet the job requirement with a concrete approach, not a slogan.";
    }
}
class BehavioralStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Warm-up & Pitch", "Resume Deep-Dive", "Core Competency Scenarios", "Culture Fit & Reverse Q&A"];
    }
    sectionWeights(): number[]{
        // Exact 3 / 8 / 14 / 5 on a 30-minute behavioral round (scaled for other durations).
        return [3, 8, 14, 5];
    }
    introShare(): number{
        return 0;
    }
    followUp(sectionName: string): string{
        if (sectionName === "Resume Deep-Dive") {
            return "Claim to test: they name their personal action with I, not only we, and a measurable result.";
        }
        if (sectionName === "Core Competency Scenarios") {
            return "Claim to test: they describe a concrete past event with clear individual action and outcome.";
        }
        if (sectionName === "Culture Fit & Reverse Q&A") {
            return "Claim to test: they show genuine curiosity about the team, role, and engineering culture.";
        }
        return "Claim to test: they give a clear career narrative aligned with the target role.";
    }
}
class SystemDesignStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Requirements", "Design", "Tradeoffs"];
    }
    sectionWeights(): number[]{
        return [0.25, 0.45, 0.3];
    }
    introShare(): number{
        return 0.06;
    }
    followUp(sectionName: string): string{
        if (sectionName === "Design") {
            return "Claim to test: they justify SQL vs NoSQL or cache choice with a consistency tradeoff.";
        }
        if (sectionName === "Tradeoffs") {
            return "Claim to test: they name which component breaks first under a 10x spike and how they protect it.";
        }
        return "Claim to test: they ask or state scale and functional scope before designing.";
    }
}
class HrStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Motivation","Close"];
    }
    sectionWeights(): number[]{
        return [0.25, 0.45, 0.3];
    }
    introShare(): number{
        return 0;
    }
    followUp(sectionName: string): string{
        return "Claim to test: the reason is specific to this role or company, not a generic growth line.";
    }
}
class MixedStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Technical", "Behavioral"];
    }
    sectionWeights(): number[]{
        return [0.2, 0.45, 0.35];
    }
    introShare(): number{
        return 0;
    }
    followUp(sectionName: string): string{
        if (sectionName === "Technical") {
            return "Claim to test: they explain the mechanism and one cost or tradeoff.";
        }
        if (sectionName === "Behavioral") {
            return "Claim to test: they name a personal action and a measurable result.";
        }
        return "Claim to test: they state personal ownership in one concrete project.";
    }
}
const strategies: Record<InterviewType, InterviewStrategy>={
    coding: new CodingStrategy(),
    technical: new TechnicalStrategy(),
    behavioral: new BehavioralStrategy(),
    system_design: new SystemDesignStrategy(),
    hr: new HrStrategy(),
    mixed: new MixedStrategy(),
};
export function interviewStrategyFor(type: InterviewType): InterviewStrategy{
    return strategies[type];
}

export function allocateMinutes(total: number, weights: number[]): number[] {
    if (weights.length === 0) {
        return [];
    }
    const sum = weights.reduce((left, right) => left + right, 0) || weights.length;
    const raw = weights.map((weight) => Math.floor((total * weight) / sum));
    let used = raw.reduce((left, right) => left + right, 0);
    let index = raw.length - 1;
    while (used < total) {
        raw[index] += 1;
        used += 1;
        index = index === 0 ? raw.length - 1 : index - 1;
    }
    return raw;
}

export function introMinutesFor(type: InterviewType, totalMinutes: number): number {
    const share = interviewStrategyFor(type).introShare();
    if (share <= 0 || totalMinutes < 10) {
        return 0;
    }
    return Math.max(2, Math.min(4, Math.round(totalMinutes * share)));
}
