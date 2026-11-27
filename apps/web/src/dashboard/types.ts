export type StudioView = "overview" | "rooms" | "brush" | "banks";

export type RoomSummary = {
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
