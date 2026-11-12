import type {InterviewConfiguration, InterviewPlan, InterviewType, PlanSection, ResearchSource,} from "@practice-room/shared-types";

const sectionNames: Record<InterviewType,string[]>={
    coding: ["Problem solving", "Implementation", "Complexity"],
    technical:["Background", "Core concepts", "Follow-ups"],
    behavioral: ["Introduction", "Past experience", "Reflection"],
    system_design:["Requirements", "Design", "Tradeoffs"],
    hr: ["Introduction", "Motivation","Close"],
    mixed:["Introduction", "Technical", "Behavioral"],

}

export function buildInterviewPlan(
    config: InterviewConfiguration,
    sources: ResearchSource[],
): InterviewPlan {
    const names=sectionNames[config.interviewType];
    const base= Math.floor(config.durationMinutes / names.length);
    const remainder=config.durationMinutes % names.length;
    const sourceUrls=sources.map((source)=>source.url);
    const topic=config.job ? `${config.job.role} at ${config.job.company}`: config.skills.join(", ");

    const sections: PlanSection[]=names.map((name,index)=>{
        const minutes=base+(index === names.length - 1 ? remainder : 0);
        return {
            name,
            minutes,
            questions:[
                {
                    prompt: `Discuss ${name.toLowerCase()}for ${topic}. Use the job requirements and the public preparation sources.`,
                    rubric: `Score accuracy, problem-solving, clarity, and relevance at ${config.experienceLevel} level and ${config.difficulty} difficulty.`,
                    sourceUrls:sourceUrls.slice(0,2),
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