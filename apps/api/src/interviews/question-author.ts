import type { InterviewConfiguration, ResearchSource } from "@practice-room/shared-types";
import { interviewStrategyFor } from "./interview-strategy";
import { callRoom } from "./python-room";
import { practiceBrief } from "./rubric";

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
            codingLanguage: config.codingLanguage ?? "",
            resume: (config.resume ?? "").slice(0, 1800),
            materials: (config.materials ?? "").slice(0, 1500),
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
      return callRoom<AuthoredQuestion[]>("prepare", JSON.parse(request) as Record<string, unknown>, 20000);
    }
  }
  