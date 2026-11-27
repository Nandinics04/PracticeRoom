import type {InterviewFeedback} from "@practice-room/shared-types";
import { buildFeedback } from "../../interviews/feedback";
import { applyMeasuredReport } from "../../interviews/delivery-metrics";
import { practiceBrief } from "../../interviews/rubric";
import type {InterviewSession, TranscriptEntry} from "../../interviews/interview-session";
import { spawn } from "node:child_process";
import { join } from "node:path";


export interface ReportGenerator {
    generate(transcript: TranscriptEntry[], context?: {rubric: string; interviewType?: string; jobDescription?: string; resume?: string}): Promise<InterviewFeedback>;
}

export class MockReportGenerator implements ReportGenerator {
    async generate(transcript: TranscriptEntry[]): Promise<InterviewFeedback> {
      return buildFeedback(transcript);
    }
  }

  export async function reportInterview(session: InterviewSession, generator: ReportGenerator): Promise<InterviewFeedback> {
    if (session.status === "report_ready" && session.feedback) {
      return session.feedback;
    }
    if (session.status !== "completed") {
      throw new Error("Finish the interview before generating a report");
    }
    const config=session.toRecord().config;
    const feedback = await generator.generate(session.transcript, {
        rubric: practiceBrief({
            company: config.job?.company,
            role: config.job?.role,
            experienceLevel: config.experienceLevel,
            interviewType: session.interviewType,
            description: config.job?.description,
        }),
        interviewType: session.interviewType,
        jobDescription: config.job?.description ?? config.skills.join(", "),
        resume: config.resume ?? "",
    });
    if (session.feedback) {
      return session.feedback;
    }
    session.markReportReady(feedback);
    return feedback;
  }

  export class McpReportGenerator implements ReportGenerator {
    async generate(transcript: TranscriptEntry[], context?: {rubric: string; interviewType?: string; jobDescription?: string; resume?: string}): Promise<InterviewFeedback> {
      const request = JSON.stringify({
        transcript,
        rubric: context?.rubric ?? "",
        interviewType: context?.interviewType ?? "",
        jobDescription: context?.jobDescription ?? "",
        resume: context?.resume ?? "",
      });
      const serviceDir = join(__dirname, "..", "..", "..", "..", "ai-service");
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn("python", ["write_report.py"], { cwd: serviceDir });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(stderr || `write_report.py exited ${code}`));
        });
        child.stdin.write(request);
        child.stdin.end();
      });
      return JSON.parse(output) as InterviewFeedback;
    }
  }