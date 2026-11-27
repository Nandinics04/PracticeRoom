import type { InterviewSession } from "./interview-session";

export type StoredInterview = {
  id: string;
  status: string;
  title?: string;
  interviewType: string;
  overallScore?: number | null;
  brushUp?: string[];
  wpm?: number | null;
  thinkSeconds?: number | null;
  ownership?: number | null;
  pillars?: { name: string; score: number }[];
  company?: string;
  startedAt?: string | null;
  source?: string;
};

export interface SessionRepository {
  save(id: string, session: InterviewSession): void;
  get(id: string): InterviewSession;
  list(): StoredInterview[];
  listOwned(ownerId: string): StoredInterview[];
  getOwned(id: string, ownerId: string): InterviewSession;
  claimUnowned(ownerId: string): void;
  delete(id: string): void;
}
export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");