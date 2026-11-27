import { useState } from "react";

type Figure = { name: string; score: number; detail: string; needsWork: boolean };
type Question = {
    prompt: string;
    score: number;
    note: string;
    worked?: string;
    missing?: string;
    action?: string;
    honestPass?: boolean;
};
type Said = { prompt: string; answer: string; outcome?: string; action?: string };

export type PracticeReport = {
    overallScore: number;
    strengths: string[];
    improvements: string[];
    delivery?: Figure[];
    presence?: Figure[];
    questions?: Question[];
    idealAnswer?: string;
    focus?: string[];
    pillars?: Figure[];
    brushUp?: string[];
    said?: Said[];
};

const PILLAR_LABELS: Record<string, string> = {
    "Ownership and impact": "Ownership & Impact",
    "Technical depth": "Technical Depth",
    Structure: "Structure & Clarity",
    Delivery: "Delivery Composure",
};

function named(figures: Figure[] | undefined, name: string) {
    return figures?.find((figure) => figure.name === name);
}

function leading(detail: string | undefined) {
    return detail?.match(/[\d.]+/)?.[0] ?? "";
}

function withFillers(text: string) {
    return text.split(/(\b(?:um|uh|like|basically|actually|you know)\b)/gi).map((part, index) => (
        /^(?:um|uh|like|basically|actually|you know)$/i.test(part) ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>
    ));
}

export function ReportView({
    title,
    startedAt,
    report,
    pending,
    error,
    onBack,
    onLoad,
}: {
    title?: string;
    startedAt?: string | null;
    report: PracticeReport | null;
    pending: boolean;
    error: string;
    onBack: () => void;
    onLoad: () => void;
}) {
    const [checked, setChecked] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem("practice-room-brush") || "[]") as string[];
        } catch {
            return [];
        }
    });
    const pace = named(report?.delivery, "Speaking pace");
    const think = named(report?.delivery, "Thinking time");
    const fillers = named(report?.delivery, "Filler words");
    const fillerRate = fillers?.detail.match(/([\d.]+) per 100/)?.[1] ?? "";
    const presence = report?.presence ?? [];
    const focus = presence.length ? Math.round(presence.reduce((sum, row) => sum + row.score, 0) / presence.length) : null;
    const focusNote = presence.length === 0 ? "Not measured" : presence.length > 1 ? "Camera and tab" : presence[0]?.name === "Tab focus" ? "This tab" : "One face in frame";
    const when = startedAt ? new Date(startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
    const rewriteAt = report?.questions?.findIndex((question) => !question.honestPass) ?? -1;

    function toggle(topic: string) {
        const next = checked.includes(topic) ? checked.filter((item) => item !== topic) : [...checked, topic];
        setChecked(next);
        localStorage.setItem("practice-room-brush", JSON.stringify(next));
    }

    return (
        <div className="report-view">
            <header className="live-bar">
                <div className="live-brand">
                    <span>pR</span>
                    <div>
                        <strong>practiceRoom</strong>
                        <p>Report / {title || "Practice"}</p>
                    </div>
                </div>
                <p className="state state-report_ready">Session State: Completed</p>
                <button type="button" onClick={() => window.print()}>Export PDF</button>
                <button type="button" onClick={onBack}>Studio</button>
            </header>
            {error ? <p className="live-error">{error}</p> : null}
            {!report ? (
                <section className="score-card">
                    <h2>Writing the report</h2>
                    <button type="button" className="prepare" onClick={onLoad} disabled={pending}>{pending ? "Writing the report…" : "Load report"}</button>
                </section>
            ) : (
                <>
                    <section className="score-layout">
                        <article className="score-card">
                            <p>Overall Readiness Score</p>
                            <div className="score-row">
                                <strong>{report.overallScore}</strong>
                                <span>/ 100</span>
                                <i style={{ background: `conic-gradient(#3dce8d ${Math.max(0, Math.min(100, report.overallScore))}%, #2a2a31 0)` }} />
                            </div>
                            <p className="score-note">Practice feedback from the transcript. This is not a hiring decision. Accent, appearance, and emotion are not scored.</p>
                            <ul className="pillar-bars">
                                {(report.pillars ?? []).map((pillar) => (
                                    <li key={pillar.name}>
                                        <span>{PILLAR_LABELS[pillar.name] ?? pillar.name}</span>
                                        <b><i style={{ width: `${Math.max(0, Math.min(100, pillar.score))}%` }} /></b>
                                        <em>{pillar.score}%</em>
                                    </li>
                                ))}
                            </ul>
                        </article>
                        <div className="metric-tiles">
                            <article>
                                <p>Speaking Pace</p>
                                <strong>{pace ? `${leading(pace.detail)} wpm` : "—"}</strong>
                                <em>{pace ? (pace.needsWork ? "Outside 120–150" : "Optimal") : "Not measured"}</em>
                            </article>
                            <article>
                                <p>Thinking Time</p>
                                <strong>{think ? `${leading(think.detail)}s` : "—"}</strong>
                                <em>{think ? (think.needsWork ? "Outside 1.5–4s" : "Composed") : "Not measured"}</em>
                            </article>
                            <article>
                                <p>Filler Density</p>
                                <strong>{fillerRate ? `${fillerRate}%` : "—"}</strong>
                                <em>{fillers ? (fillers.needsWork ? "High" : "Low") : "Not measured"}</em>
                            </article>
                            <article>
                                <p>Camera & Tab</p>
                                <strong>{focus === null ? "—" : `${focus}%`}</strong>
                                <em>{focusNote}</em>
                            </article>
                        </div>
                    </section>
                    <section className="turn-list">
                        <h2>Turn-by-Turn Transcript</h2>
                        {(report.questions ?? []).map((question, index) => {
                            const said = report.said?.[index];
                            const followUp = (said?.action || question.action) === "stay";
                            return (
                                <article key={`${question.prompt}-${index}`}>
                                    <header>
                                        <h3>Question {index + 1}: {question.prompt}</h3>
                                        {followUp ? <span>Follow-up probe</span> : null}
                                    </header>
                                    {question.honestPass ? <p className="opted">Opted out of this question. It is on the brush-up list and is not scored as a weak answer.</p> : null}
                                    <div className="turn-grid">
                                        <div>
                                            <p>Transcript</p>
                                            <div>{said?.answer ? withFillers(said.answer) : question.note}</div>
                                        </div>
                                        <div>
                                            <p>What worked and what was missing</p>
                                            {question.worked ? <div>What worked: {question.worked}</div> : null}
                                            {question.missing ? <div>Missing: {question.missing}</div> : null}
                                            {!question.worked && !question.missing ? <div>{question.honestPass ? "—" : question.note}</div> : null}
                                        </div>
                                        <div>
                                            <p>A stronger version</p>
                                            <div>{index === rewriteAt && report.idealAnswer ? report.idealAnswer : "—"}</div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                        {(!report.questions || report.questions.length === 0) && (report.said ?? []).map((said, index) => (
                            <article key={`${said.prompt}-${index}`}>
                                <h3>Question {index + 1}: {said.prompt}</h3>
                                <div>{withFillers(said.answer)}</div>
                            </article>
                        ))}
                    </section>
                    <section className="report-bottom">
                        <article>
                            <h2>What carried through</h2>
                            <p>{report.strengths.join(" ") || "No strengths were written."}</p>
                            <p>{report.improvements.join(" ")}</p>
                            {report.focus && report.focus.length > 0 ? <ol>{report.focus.map((item) => <li key={item}>{item}</li>)}</ol> : null}
                        </article>
                        <article>
                            <h2>Topics to Brush Up On</h2>
                            {(report.brushUp ?? []).length === 0 ? <p>No topic was passed honestly in this interview.</p> : (
                                <ul>
                                    {report.brushUp?.map((topic) => (
                                        <li key={topic}>
                                            <label>
                                                <input type="checkbox" checked={checked.includes(topic)} onChange={() => toggle(topic)} />
                                                {topic}
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </article>
                    </section>
                    <p className="report-foot">
                        {when ? `Session started ${when}. ` : ""}
                        The camera and Kokoro stay on this device. This scorecard is written from the transcript. Accent, appearance, and emotion are not scored.
                    </p>
                </>
            )}
        </div>
    );
}
