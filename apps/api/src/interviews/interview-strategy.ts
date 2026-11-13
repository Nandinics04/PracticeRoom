import type {InterviewType} from "@practice-room/shared-types";

export interface InterviewStrategy{
    sectionNames(): string[];
}
class CodingStrategy implements InterviewStrategy{
     sectionNames(): string[]{
        return ["Problem solving", "Implementation", "Complexity"];
     }
}
class TechnicalStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Background", "Core concepts", "Follow-ups"];
    }
}
class BehavioralStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Past experience", "Reflection"];
    }
}
class SystemDesignStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Requirements", "Design", "Tradeoffs"];
    }
}
class HrStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Motivation","Close"];
    }
}
class MixedStrategy implements InterviewStrategy{
    sectionNames(): string[]{
        return ["Introduction", "Technical", "Behavioral"];
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
