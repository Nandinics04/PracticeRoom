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
    if(input.mode === "job"){
        if(!input.company.trim() || !input.role.trim() || !input.description.trim()){
            throw new Error("Company, role, and description are required");
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
            job:{
                company: input.company.trim(),
                role:input.role.trim(),
                description: input.description.trim(),
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
};
}