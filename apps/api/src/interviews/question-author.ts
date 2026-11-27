import type { InterviewConfiguration, ResearchSource } from "@practice-room/shared-types";
import { interviewStrategyFor } from "./interview-strategy";
import { practiceBrief } from "./rubric";
import { spawn } from "node:child_process";
import { join } from "node:path";

export type AuthoredQuestion = {
  sectionName: string;
  prompt: string;
  followUpPrompt: string;
};

export interface QuestionAuthor {
  writeQuestions(
    config: InterviewConfiguration,
    sources: ResearchSource[],
  ): Promise<AuthoredQuestion[]>;
}

export class MockQuestionAuthor implements QuestionAuthor {
    async writeQuestions(config: InterviewConfiguration, sources: ResearchSource[]): Promise<AuthoredQuestion[]> {
      void sources;
      const strategy = interviewStrategyFor(config.interviewType);
      const topic = config.job
        ? `${config.job.role} at ${config.job.company}`
        : config.skills.join(", ");
      return strategy.sectionNames().map((sectionName) => ({
        sectionName,
        prompt: `Discuss ${sectionName.toLowerCase()} for ${topic}. Use the job requirements and the public preparation sources.`,
        followUpPrompt: strategy.followUp(sectionName),
      }));
    }
}

export class McpQuestionAuthor implements QuestionAuthor {
    async writeQuestions(config: InterviewConfiguration, sources: ResearchSource[]): Promise<AuthoredQuestion[]> {
      const strategy = interviewStrategyFor(config.interviewType);
      const topic = config.job
        ? `${config.job.role} at ${config.job.company}`
        : config.skills.join(", ");
        const request = JSON.stringify({
            topic,
            company: config.job?.company ?? "",
            role: config.job?.role ?? "",
            description: config.job?.description ?? "",
            experienceLevel: config.experienceLevel,
            difficulty: config.difficulty,
            interviewType: config.interviewType,
            persona: config.persona,
            practiceMode: config.practiceMode,
            skills: config.skills,
            resume: (config.resume ?? "").slice(0, 500),
            materials: config.materials ?? "",
            brief: practiceBrief({
              company: config.job?.company,
              role: config.job?.role,
              experienceLevel: config.experienceLevel,
              interviewType: config.interviewType,
              description: config.job?.description ?? config.skills.join(", "),
            }),
            sections: strategy.sectionNames(),
            sources: sources.slice(0, 4).map((source) => ({
              platform: source.platform,
              title: source.title,
              excerpt: source.excerpt.slice(0, 400),
            })),
          });
      const serviceDir = join(__dirname, "..", "..", "..", "ai-service");
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn("python", ["prepare_questions.py"], { cwd: serviceDir });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(stderr || `prepare_questions.py exited ${code}`));
        });
        child.stdin.write(request);
        child.stdin.end();
      });
      return JSON.parse(output) as AuthoredQuestion[];
    }
  }
  