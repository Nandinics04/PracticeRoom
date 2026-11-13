import type {InterviewType} from "@practice-room/shared-types";

export interface InterviewStrategy{
    sectionNames(): string[];
    followUp(sectionName: string): string;
}
class CodingStrategy implements InterviewStrategy{
     sectionNames(): string[]{
        return ["Problem solving", "Implementation", "Complexity"];
     }
     followUp(sectionName: string): string{
        return `Walk through ${sectionName}, then give the time complexity`;
     }
}
class TechnicalStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Background", "Core concepts", "Follow-ups"];
    }
    followUp(sectionName: string): string{
        return `Go deeper on ${sectionName}, Add an example`;
    }
}
class BehavioralStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Past experience", "Reflection"];
    }
    followUp(sectionName: string): string{
        return `In ${sectionName}, what did you do and what was the result?`;
    }
}
class SystemDesignStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Requirements", "Design", "Tradeoffs"];
    }
    followUp(sectionName: string): string{
        return `For ${sectionName}, name one tradeoff and why you chose it.`;
    }
}
class HrStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Motivation","Close"];
    }
    followUp(sectionName: string): string{
        return `Tell me more about your ${sectionName}.`
    }
}
class MixedStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Technical", "Behavioral"];
    }
    followUp(sectionName: string): string{
        return `Add a concrete example for ${sectionName}.`;
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
