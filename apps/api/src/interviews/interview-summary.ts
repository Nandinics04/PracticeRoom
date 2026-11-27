import type { InterviewSession } from "./interview-session";
import type { StoredInterview } from "./session-repository";

function leadingNumber(detail: string | undefined): number | null {
    const match = detail?.match(/[\d.]+/);
    if (!match) {
        return null;
    }
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
}

export function summarizeInterview(id: string, session: InterviewSession): StoredInterview {
    const record = session.toRecord();
    const feedback = record.feedback;
    const pace = feedback?.delivery?.find((row) => row.name === "Speaking pace");
    const think = feedback?.delivery?.find((row) => row.name === "Thinking time");
    const ownership = feedback?.content?.find((row) => row.name === "Ownership language");
    const notes = Boolean(record.config.materials?.trim() || record.config.resume?.trim());
    const company = record.config.job?.company?.trim() ?? "";
    return {
        id,
        status: session.status,
        title: session.plan?.title,
        interviewType: session.interviewType,
        overallScore: feedback ? feedback.overallScore : null,
        brushUp: feedback?.brushUp ?? [],
        wpm: leadingNumber(pace?.detail),
        thinkSeconds: leadingNumber(think?.detail),
        ownership: ownership?.score ?? null,
        pillars: feedback?.pillars?.map((pillar) => ({ name: pillar.name, score: pillar.score })) ?? [],
        company,
        startedAt: session.startedAt,
        source: notes ? "Your notes" : company ? "Company questions" : "Practice template",
    };
}
