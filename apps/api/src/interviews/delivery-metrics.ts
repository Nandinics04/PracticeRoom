import type { InterviewFeedback, QuestionScore, ScoreFigure, TurnMeasure } from "@practice-room/shared-types";
import type { TranscriptEntry } from "./interview-session";

function clamp(score: number) {
    return Math.max(0, Math.min(100, Math.round(score)));
}

function figure(name: string, score: number, detail: string, needsWork: boolean): ScoreFigure {
    return { name, score: clamp(score), detail, needsWork };
}

function average(values: number[]) {
    if (values.length === 0) {
        return 0;
    }
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function wordsOf(text: string) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

function fillersOf(text: string) {
    return text.match(/\b(um|uh|like|basically|actually|you know)\b/gi)?.length ?? 0;
}

function speakingMs(entry: TranscriptEntry) {
    const elapsed = entry.delivery?.elapsedMs ?? 0;
    const latency = entry.delivery?.latencyMs ?? 0;
    if (latency > 0 && elapsed > latency) {
        return elapsed - latency;
    }
    return elapsed;
}

function named(rows: ScoreFigure[], labels: string[]) {
    const wanted = new Set(labels.map((label) => label.toLowerCase()));
    return rows.filter((row) => wanted.has(row.name.toLowerCase()));
}

export function applyMeasuredReport(report: InterviewFeedback, transcript: TranscriptEntry[]): InterviewFeedback {
    const answered = transcript.filter((entry) => entry.answer.trim());
    const timed = answered.filter((entry) => entry.delivery);
    const text = answered.map((entry) => entry.answer).join(" ");
    const words = wordsOf(text);
    const fillers = fillersOf(text);
    const elapsed = timed.reduce((sum, entry) => sum + (entry.delivery?.elapsedMs ?? 0), 0);
    const spoken = timed.reduce((sum, entry) => sum + speakingMs(entry), 0);
    const minutes = spoken / 60000;
    const wpm = minutes ? Math.round(words / minutes) : 0;
    const latency = timed.map((entry) => entry.delivery?.latencyMs ?? 0).filter((value) => value > 0);
    const think = latency.length ? Math.round((latency.reduce((sum, value) => sum + value, 0) / latency.length / 1000) * 10) / 10 : 0;
    const seconds = timed.length ? Math.round(elapsed / timed.length / 1000) : 0;
    const perHundred = words ? Math.round((fillers / words) * 1000) / 10 : 0;
    const personal = text.match(/\b(i|me|my|mine)\b/gi)?.length ?? 0;
    const team = text.match(/\b(we|our|us|ours)\b/gi)?.length ?? 0;
    const personalShare = personal + team === 0 ? 0 : personal / (personal + team);
    const hidden = timed.reduce((sum, entry) => sum + (entry.delivery?.tabHidden ?? 0), 0);
    const awayMs = timed.reduce((sum, entry) => sum + (entry.delivery?.tabAwayMs ?? 0), 0);
    const faces = timed.map((entry) => entry.delivery?.faces).filter((count): count is number => count !== null && count !== undefined);
    const delivery: ScoreFigure[] = timed.length === 0 ? [] : [
        figure("Speaking pace", wpm >= 120 && wpm <= 150 ? 100 : Math.max(0, 100 - Math.abs(wpm - 135) * 1.5), `${wpm} words per minute. A steady pace is 120 to 150.`, wpm < 105 || wpm > 165),
        figure("Thinking time", think >= 1.5 && think <= 4 ? 100 : Math.max(0, 100 - Math.abs(think - 2.75) * 12), `${think} seconds after the question before the answer started. A composed start is 1.5 to 4 seconds.`, think < 1.5 || think > 8),
        figure("Answer length", seconds >= 45 && seconds <= 120 ? 100 : Math.max(0, 100 - Math.abs(seconds - 80) / 2), `About ${seconds} seconds per answer. Under 20 seconds is thin, and over 150 seconds is hard to follow.`, seconds < 20 || seconds > 150),
        figure("Filler words", Math.max(0, 100 - Math.round(perHundred * 8)), `${fillers} fillers, ${perHundred} per 100 words.`, perHundred > 4),
    ];
    const presence: ScoreFigure[] = [];
    if (timed.length > 0) {
        const awaySeconds = Math.round(awayMs / 1000);
        presence.push(figure("Tab focus", Math.max(0, 100 - hidden * 25), `The interview tab was hidden ${hidden} times, for about ${awaySeconds} seconds. Coding rounds are not counted.`, hidden > 0));
    }
    if (faces.length > 0) {
        const centered = faces.filter((count) => count === 1).length;
        const percent = Math.round(100 * centered / faces.length);
        presence.push(figure("In frame", percent, `One face was in frame at the end of ${percent}% of answers.`, percent < 70));
    }
    const ownership = answered.length === 0 ? null : figure(
        "Ownership language",
        personal + team === 0 ? 40 : Math.round(personalShare * 100),
        `I, me, or my appeared ${personal} times. We, our, or us appeared ${team} times.`,
        personal + team === 0 || personalShare < 0.4,
    );
    const content = [...(report.content ?? [])];
    if (ownership && !content.some((row) => row.name === "Ownership language")) {
        content.push(ownership);
    }
    const brushUp = answered
        .filter((entry) => entry.outcome === "polite_opt_out")
        .map((entry) => entry.prompt.replace(/\s+/g, " ").trim())
        .filter((prompt, index, all) => prompt && all.indexOf(prompt) === index)
        .slice(0, 6);
    const questions: QuestionScore[] = (report.questions ?? []).map((question, index) => {
        const passed = answered[index]?.outcome === "polite_opt_out";
        return {
            ...question,
            action: answered[index]?.action ?? question.action ?? "",
            honestPass: passed || undefined,
            worked: passed ? "You said this was unfamiliar instead of guessing." : question.worked,
            missing: passed ? "" : question.missing,
            note: passed
                ? "You passed honestly. This topic is on the brush-up list, and it is not scored as a weak answer."
                : question.note || [question.worked, question.missing].filter(Boolean).join(" "),
        };
    });
    const turns: TurnMeasure[] = timed.map((entry) => {
        const entryWords = wordsOf(entry.answer);
        const entrySpoken = speakingMs(entry);
        const entryMinutes = entrySpoken / 60000;
        return {
            prompt: entry.prompt,
            wpm: entryMinutes ? Math.round(entryWords / entryMinutes) : 0,
            thinkSeconds: Math.round(((entry.delivery?.latencyMs ?? 0) / 1000) * 10) / 10,
            seconds: Math.round((entry.delivery?.elapsedMs ?? 0) / 1000),
            action: entry.action ?? "",
        };
    });
    const contentScore = average(content.map((row) => row.score)) || average(report.criteria.map((row) => row.score));
    const deliveryScore = average(delivery.map((row) => row.score));
    const presenceScore = average(presence.map((row) => row.score));
    const overallScore = delivery.length === 0
        ? report.overallScore
        : presence.length > 0
            ? Math.round(contentScore * 0.55 + deliveryScore * 0.28 + presenceScore * 0.17)
            : Math.round(contentScore * 0.65 + deliveryScore * 0.35);
    const technical = average([
        ...named(content, ["Code"]).map((row) => row.score),
        ...report.criteria.filter((row) => row.name === "technical_accuracy" || row.name === "problem_solving").map((row) => row.score),
    ]);
    const ownershipImpact = average(named(content, ["Ownership", "Quantified impact", "Ownership language"]).map((row) => row.score));
    const structure = average([
        ...named(content, ["STAR completeness", "Follow-up resilience"]).map((row) => row.score),
        ...report.criteria.filter((row) => row.name === "completeness").map((row) => row.score),
    ]);
    const pillars = [
        figure("Technical depth", technical || contentScore, "From the technical scores and the code, when code was part of the interview.", false),
        figure("Ownership and impact", ownershipImpact || contentScore, "From what you owned, the outcome you named, and how often you spoke as yourself.", false),
        figure("Structure", structure || contentScore, "From how complete the answer was, and whether a follow-up was needed.", false),
        figure("Delivery", deliveryScore || contentScore, "From pace, thinking time, answer length, and filler words.", false),
    ];
    return {
        ...report,
        overallScore,
        content,
        delivery: delivery.length > 0 ? delivery : report.delivery,
        presence: presence.length > 0 ? presence : report.presence,
        questions,
        turns,
        pillars,
        brushUp,
        strengths: brushUp.length > 0
            ? ["You named an unfamiliar topic instead of guessing. That pass is not scored as a weak answer.", ...report.strengths]
            : report.strengths,
    };
}
