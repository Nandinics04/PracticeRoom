import type {InterviewConfiguration, InterviewPlan, PlanSection, ResearchSource,} from "@practice-room/shared-types";
import {interviewStrategyFor} from "./interview-strategy";
import type { AuthoredQuestion } from "./question-author";
import {rubricText} from "./rubric";


export function buildInterviewPlan(
    config: InterviewConfiguration,
    sources: ResearchSource[],
    questions: AuthoredQuestion[] = [],
): InterviewPlan {
    const strategy=interviewStrategyFor(config.interviewType);
    const names=strategy.sectionNames();
    const base= Math.floor(config.durationMinutes / names.length);
    const remainder=config.durationMinutes % names.length;
    const sourceUrls=sources.map((source)=>source.url);
    const topic=config.job ? `${config.job.role} at ${config.job.company}`: config.skills.join(", ");

    const sections: PlanSection[]=names.map((name,index)=>{
        const minutes=base+(index === names.length - 1 ? remainder : 0);
        const written = questions.find((question) => question.sectionName === name);
        return {
            name,
            minutes,
           
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
    }
}