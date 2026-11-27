import type { ReactNode, RefObject } from "react";
import Editor from "@monaco-editor/react";
import { editorLanguage, languageLabel, readCodingProblem } from "./coding-problem";

const ROUNDS: Record<string, string> = {
    technical: "Technical round",
    coding: "Coding round",
    behavioral: "Behavioral round",
    system_design: "System design round",
    hr: "HR round",
    mixed: "Mixed round",
};

export function LiveStage({
    title,
    interviewType,
    sections,
    sectionName,
    prompt,
    hint,
    mode,
    answer,
    onAnswer,
    onEditStart,
    onEditEnd,
    videoRef,
    cameraReady,
    userName,
    levels,
    presence,
    tabFocused,
    clock,
    coding,
    code,
    onCode,
    consoleText,
    running,
    onReset,
    onRun,
    pending,
    error,
    earlier,
    done,
    report,
    onListen,
    onFinish,
    onSkip,
    onEnd,
    onLeave,
}: {
    title?: string;
    interviewType: string;
    sections: { name: string; minutes: number }[];
    sectionName: string;
    prompt: string;
    hint: string;
    mode: "preparing" | "speaking" | "listening" | "refining" | "done";
    answer: string;
    onAnswer: (value: string) => void;
    onEditStart: () => void;
    onEditEnd: () => void;
    videoRef: RefObject<HTMLVideoElement | null>;
    cameraReady: boolean;
    userName: string;
    levels: number[];
    presence: string;
    tabFocused: boolean;
    clock: string;
    coding: boolean;
    code: string;
    onCode: (value: string) => void;
    consoleText: string;
    running: boolean;
    onReset: () => void;
    onRun: () => void;
    pending: string;
    error: string;
    earlier: { role: "interviewer" | "you"; text: string }[];
    done: boolean;
    report: ReactNode;
    onListen: () => void;
    onFinish: () => void;
    onSkip: () => void;
    onEnd: () => void;
    onLeave: () => void;
}) {
    const names = [...sections.map((section) => section.name)];
    if (!names.includes("Introduction")) {
        names.unshift("Introduction");
    }
    if (sectionName === "Wrap-up" && !names.includes("Wrap-up")) {
        names.push("Wrap-up");
    }
    const active = names.indexOf(sectionName);
    const busy = pending === "hear" || pending === "answer" || pending === "end";
    const clockIsTime = /^\d+:\d+/.test(clock);
    const status = mode === "preparing"
        ? "Preparing the question"
        : mode === "speaking"
            ? "Speaking · Kokoro (af_heart)"
            : mode === "refining"
                ? "Refining with Groq Whisper"
                : mode === "done"
                    ? "This interview is complete"
                    : "Listening to you... (Silero VAD)";

    return (
        <div className="live-room">
            <header className="live-bar">
                <div className="live-brand">
                    <span>pR</span>
                    <div>
                        <strong>practiceRoom</strong>
                        <p>{title || "Practice"} · {ROUNDS[interviewType] ?? interviewType}</p>
                    </div>
                </div>
                <ol className="section-pills">
                    {names.map((name, index) => (
                        <li key={`${name}-${index}`} className={done || (active >= 0 && index < active) ? "done" : index === active ? "active" : ""}>
                            {index + 1}. {name}{done || (active >= 0 && index < active) ? " (Done)" : index === active ? " (Active)" : ""}
                        </li>
                    ))}
                </ol>
                <div className="live-meta">
                    {clockIsTime ? <strong>{clock}</strong> : null}
                    <p>{presence} · {tabFocused ? "Tab focused" : "Tab hidden"}</p>
                    <button type="button" onClick={onLeave}>Studio</button>
                </div>
            </header>
            {clock && !clockIsTime ? <p className="live-notice">{clock}</p> : null}
            {error ? <p className="live-error">{error}</p> : null}
            {coding && !done ? (
                <div className="coding-room">
                    <ProblemPane prompt={prompt} />
                    <section className="editor-pane">
                        <div className="editor-bar">
                            <span>{languageLabel(editorLanguage(title || ""))}</span>
                            <button type="button" onClick={onReset}>Reset</button>
                            <button type="button" className="run-code" onClick={onRun} disabled={running || busy}>{running ? "Running…" : "Run & Submit Code"}</button>
                        </div>
                        <div className="editor-fill">
                            <Editor key={editorLanguage(title || "")} height="100%" defaultLanguage={editorLanguage(title || "")} theme="vs-dark" value={code} onChange={(value) => onCode(value ?? "")} />
                        </div>
                        <div className="console">
                            <p>Console</p>
                            <pre>{consoleText || "Run the code to see what it prints. There is no hidden test suite."}</pre>
                        </div>
                    </section>
                    <aside className="coding-side">
                        <section className="interviewer-card compact">
                            <div className="card-top">
                                <span>Interviewer · Kokoro (af_heart)</span>
                            </div>
                            <div className={mode === "speaking" || mode === "preparing" ? "orb on" : "orb"} aria-hidden="true" />
                            <p className="spoken-question">{codingPrompt(prompt) || status}</p>
                        </section>
                        <aside className="pip-card">
                            <p>Candidate</p>
                            <div className="pip-frame">
                                <video ref={videoRef} className={cameraReady ? "live" : "off"} autoPlay playsInline muted />
                                {!cameraReady ? <span>Camera off</span> : null}
                            </div>
                        </aside>
                        <section className="listen-box">
                            <p>{mode === "refining" ? "Groq Whisper is rewriting this pause" : "Live listen · en-IN"}</p>
                            <textarea
                                rows={3}
                                value={answer}
                                placeholder="Your words appear here."
                                disabled={busy}
                                onFocus={onEditStart}
                                onBlur={onEditEnd}
                                onChange={(event) => onAnswer(event.target.value)}
                            />
                        </section>
                    </aside>
                </div>
            ) : null}
            {coding && !done ? null : <div className="live-stage">
                <section className={mode === "speaking" ? "interviewer-card speaking" : "interviewer-card"}>
                    <div className="card-top">
                        <span>Interviewer · Kokoro (af_heart)</span>
                        <em className={mode === "listening" ? "listen-pill" : ""}>{status}</em>
                    </div>
                    <div className={mode === "speaking" || mode === "preparing" ? "orb on" : "orb"} aria-hidden="true" />
                    <p className="spoken-question">{prompt || "The interviewer speaks first."}</p>
                    {hint ? <p className="coach-hint">Coach. {hint}</p> : null}
                </section>
                <aside className="pip-card">
                    <p>Candidate</p>
                    <div className="pip-frame">
                        <video ref={videoRef} className={cameraReady ? "live" : "off"} autoPlay playsInline muted />
                        {!cameraReady ? <span>Camera off</span> : null}
                    </div>
                    <p className="pip-mic">{userName} · {mode === "listening" ? "Mic open · en-IN" : "Mic idle"}
                        <i>{levels.map((level, index) => <b key={index} style={{ transform: `scaleY(${level})` }} />)}</i>
                    </p>
                </aside>
            </div>}
            {coding && !done ? null : (
                <section className="listen-box">
                    <p>{mode === "refining" ? "Groq Whisper is rewriting this pause" : "Live listen · en-IN. Groq Whisper rewrites it when you pause."}</p>
                    <textarea
                        rows={3}
                        value={answer}
                        placeholder="Speak in your accent. This box follows along, then Whisper rewrites the pause."
                        disabled={done || busy}
                        onFocus={onEditStart}
                        onBlur={onEditEnd}
                        onChange={(event) => onAnswer(event.target.value)}
                    />
                </section>
            )}
            {earlier.length > 0 ? (
                <details className="earlier">
                    <summary>Earlier in this room</summary>
                    <ol>
                        {earlier.map((line, index) => <li key={`${line.role}-${index}`}><span>{line.role === "you" ? userName : "Interviewer"}</span>{line.text}</li>)}
                    </ol>
                </details>
            ) : null}
            {!done ? (
                <div className="live-controls">
                    <button type="button" className="mic-button" onClick={onListen} disabled={busy || mode === "preparing" || mode === "speaking"} aria-label="Speak your answer">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z" /></svg>
                    </button>
                    <button type="button" onClick={onFinish} disabled={busy || mode === "preparing" || mode === "speaking" || (!answer.trim() && !code.trim())}>
                        {pending === "hear" ? "Hearing your answer…" : pending === "answer" ? "Sending…" : "Finish Answer Early"}
                    </button>
                    <button type="button" className="skip" onClick={onSkip} disabled={busy || mode === "preparing" || mode === "speaking"}>
                        Skip / I Don't Remember
                        <small>polite opt-out</small>
                    </button>
                    <button type="button" className="end-room" onClick={onEnd} disabled={busy}>{pending === "end" ? "Ending…" : "End Interview"}</button>
                </div>
            ) : null}
            {report}
        </div>
    );
}

function codingPrompt(prompt: string) {
    if (/^problem statement/i.test(prompt) || /tell me about a project you owned/i.test(prompt) || /walk me through how you would solve/i.test(prompt)) {
        return "The problem is on the left. Walk me through your approach, then write the function.";
    }
    return prompt;
}

function ProblemPane({ prompt }: { prompt: string }) {
    const problem = readCodingProblem(prompt);
    return (
        <section className="problem">
            <h2>Problem statement</h2>
            <p>{problem.statement}</p>
            {problem.constraints.length > 0 ? (
                <>
                    <h3>Constraints</h3>
                    <ul>
                        {problem.constraints.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                </>
            ) : null}
            {problem.input && problem.output ? (
                <>
                    <h3>Example</h3>
                    <p className="example-label">Input</p>
                    <pre>{problem.input}</pre>
                    <p className="example-label">Output</p>
                    <pre>{problem.output}</pre>
                </>
            ) : null}
        </section>
    );
}
