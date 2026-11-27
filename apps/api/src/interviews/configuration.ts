import type {
    InterviewConfiguration,
    JobInterviewInput,
    SkillInterviewInput,
} from "@practice-room/shared-types";

export function toInterviewConfiguration(
    input: JobInterviewInput | SkillInterviewInput,
): InterviewConfiguration {
    if(input.durationMinutes <= 0){
        throw new Error("Duration must be greater than 0");
    }
    const resume = input.resume?.trim().slice(0, 4000) || undefined;
    const materials = input.materials?.trim().slice(0, 4000) || undefined;
    const persona = input.persona ?? "recruiter";
    const practiceMode = input.practiceMode ?? "real";
    if(input.mode === "job"){
        const company = input.company?.trim() ?? "";
        const role = input.role?.trim() ?? "";
        const description = input.description?.trim() || `${role} at ${company}. ${input.interviewType} interview.`;
        if(!company || !role){
            throw new Error("Company and role are required");
        }
        return{
            mode: "job",
            interviewType: input.interviewType,
            experienceLevel: input.experienceLevel,
            difficulty: input.difficulty,
            durationMinutes: input.durationMinutes,
            skills: [],
            focusAreas: input.focusAreas || [],
            round: input.round,
            resume,
            materials,
            persona,
            practiceMode,
            job:{
                materials,
                company,
                role,
                description,
                url:input.url,
            },
        };
    }


const skills=input.skills.map((skill) => skill.trim()).filter(Boolean);
if(skills.length === 0){
    throw new Error("At least one skill is required");
}
return{
    mode: "skill",
    interviewType: input.interviewType,
    experienceLevel: input.experienceLevel,
    difficulty: input.difficulty,
    durationMinutes: input.durationMinutes,
    skills,
    focusAreas: input.focusAreas || [],
    resume,
    materials,
    persona,
    practiceMode,
};
}