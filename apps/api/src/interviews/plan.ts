import type {InterviewConfiguration, InterviewPlan, PlanSection, ResearchSource,} from "@practice-room/shared-types";
import {allocateMinutes, interviewStrategyFor, introMinutesFor} from "./interview-strategy";
import type { AuthoredQuestion } from "./question-author";
import {rubricText} from "./rubric";


export function buildInterviewPlan(
    config: InterviewConfiguration,
    sources: ResearchSource[],
    questions: AuthoredQuestion[] = [],
): InterviewPlan {
    const strategy=interviewStrategyFor(config.interviewType);
    const names=strategy.sectionNames();
    const introMinutes = introMinutesFor(config.interviewType, config.durationMinutes);
    const sectionBudget = Math.max(names.length, config.durationMinutes - introMinutes);
    const minutes = allocateMinutes(sectionBudget, strategy.sectionWeights());
    const sourceUrls=sources.map((source)=>source.url);
    const topic=config.job ? `${config.job.role} at ${config.job.company}`: config.skills.join(", ");

    const sections: PlanSection[]=names.map((name,index)=>{
        const written = questions.find((question) => question.sectionName === name);
        return {
            name,
            minutes: minutes[index] ?? 1,
           
            questions:[
                {
                    prompt: written?.prompt ?? `Discuss ${name.toLowerCase()} for ${topic}. Use the job requirements and the public preparation sources.`,
                    rubric: rubricText(config.interviewType),
                    sourceUrls:sourceUrls.slice(0,2),
                    followUpPrompt: written?.followUpPrompt ?? strategy.followUp(name),
                },
            ],
            
        };
    });
    return {
        title: topic,
        totalMinutes: config.durationMinutes,
        sections,
        sourceUrls,
        ...(introMinutes > 0 ? { introMinutes } : {}),
    }
}

export function displaySections(plan: InterviewPlan | null | undefined): { name: string; minutes: number }[] {
    if (!plan) {
        return [];
    }
    const intro = plan.introMinutes ?? 0;
    const body = plan.sections.map((section) => ({ name: section.name, minutes: section.minutes }));
    if (intro > 0) {
        return [{ name: "Introduction", minutes: intro }, ...body];
    }
    return body;
}
