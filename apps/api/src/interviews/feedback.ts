import type {
    FeedbackCriterion,
    FeedbackCriterionName,
    InterviewFeedback,
    ScoreConfidence,
} from "@practice-room/shared-types";
import type { TranscriptEntry } from "./interview-session";

const criterionNames: FeedbackCriterionName[]=["technical_accuracy", "problem_solving", "communication_clarity", "answer_relevance", "completeness"];
const shortAnswerLimit=40;

export function buildFeedback(transcript: TranscriptEntry[]): InterviewFeedback{
    const answered=transcript.filter((entry)=>entry.answer.trim().length>0);
    if(answered.length===0){
        throw new Error("Cannot score an interview with no answers");
    }
    const shortEntries=answered.filter((entry)=>entry.answer.length<shortAnswerLimit);
    const longEntries=answered.filter((entry)=>entry.answer.length>=shortAnswerLimit);
    const mostlyShort=shortEntries.length>longEntries.length;
    const score=mostlyShort ? 40 : 80;
    const evidence=(mostlyShort? shortEntries[0]:longEntries[0]).answer.trim();
    const confidence: ScoreConfidence=mostlyShort? "low" :"high";
    const criteria:FeedbackCriterion[]=criterionNames.map((name)=>({
       name,
       score,
       evidence,
       explanation: mostlyShort
       ? `${name} has limited support because the answer is too short to judge.`
       : `${name} is supported by a developed answer.`,
       confidence,
    }));
    return {
        overallScore: score,
        criteria,
        strengths: longEntries.map((entry)=>`Developed answer in ${entry.sectionName}.`),
        improvements: shortEntries.map((entry)=>`Expand the answer in ${entry.sectionName}.`),
        practiceTopics:shortEntries.map((entry)=>entry.sectionName),
    };
       
    
}