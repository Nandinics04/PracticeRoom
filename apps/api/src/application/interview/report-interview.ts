import type {InterviewFeedback} from "@practice-room/shared-types";
import { buildFeedback } from "../../interviews/feedback";
import type {InterviewSession, TranscriptEntry} from "../../interviews/interview-session";

export interface ReportGenerator{
    generate(transcript: TranscriptEntry[]): InterviewFeedback;
}

export class MockReportGenerator implements ReportGenerator{
    generate(transcript: TranscriptEntry[]): InterviewFeedback{
        return buildFeedback(transcript);
    }
}

export function reportInterview(session: InterviewSession, generator: ReportGenerator): InterviewFeedback{
    if(session.status!=="completed"){
        throw new Error("Finish the interview before generating a report");
    }
    const feedback=generator.generate(session.transcript);
    session.markReportReady();
    return feedback;
}