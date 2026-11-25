import type { InterviewSession } from "./interview-session";

export type StoredInterview = {
  id: string;
  status: string;
  title?: string;
  interviewType: string;
};

export interface SessionRepository {
  save(id: string, session: InterviewSession): void;
  get(id: string): InterviewSession;
  list(): StoredInterview[];
}