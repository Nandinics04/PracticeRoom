import { useEffect, useRef, useState } from "react";
import { speakAsInterviewer, unlockInterviewerVoice, watchVoiceEngine, type VoiceEngine } from "../interviewer-voice";
import { openTurnEar } from "../turn-vad";
import "./dashboard.css";

const ROUNDS: Record<string, string> = {
    technical: "Technical Deep-Dive",
    coding: "Coding",
    behavioral: "Behavioral",
    system_design: "System Design",
    hr: "HR",
    mixed: "Mixed",
};

const PERSONAS: Record<string, string> = {
    coach: "Coach",
    recruiter: "Recruiter",
    bar_raiser: "Bar raiser",
};

const STACK = ["NestJS", "Redis", "PostgreSQL", "Postgres", "MySQL", "MongoDB", "Kafka", "Docker", "Kubernetes", "React", "TypeScript", "JavaScript", "Python", "GraphQL", "gRPC", "AWS", "GCP", "Azure", "Microservices"];

function keywordHints(text: string, skills: string[]) {
    const found = new Map<string, string>();
    const add = (value: string) => {
        const clean = value.trim();
        const key = clean.toLowerCase();
        if (clean.length >= 2 && !found.has(key)) {
            found.set(key, clean);
        }
    };
    for (const skill of skills) {
        add(skill);
    }
    const haystack = text.toLowerCase();
    for (const name of STACK) {
        if (haystack.includes(name.toLowerCase())) {
            add(name);
        }
    }
    for (const match of text.matchAll(/\b[A-Z][A-Za-z0-9.+#-]{2,24}\b/g)) {
        add(match[0]);
        if (found.size >= 8) {
            break;
        }
    }
    return [...found.values()].slice(0, 8);
}

export function ReadyRoom({
    title,
    interviewType,
    sections,
    company,
    role,
    skills,
    context,
    source,
    persona,
    status,
    pending,
    error,
    onEnter,
    onBack,
}: {
    title?: string;
    interviewType: string;
    sections: { name: string; minutes: number }[];
    company: string;
    role: string;
    skills: string[];
    context: string;
    source: string;
    persona: string;
    status: string;
    pending: boolean;
    error: string;
    onEnter: () => void;
    onBack: () => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [camera, setCamera] = useState("Starting the camera");
    const [face, setFace] = useState("");
    const [mic, setMic] = useState("Checking the microphone");
    const [levels, setLevels] = useState<number[]>(Array.from({ length: 16 }, () => 0.08));
    const [vad, setVad] = useState("Loading Silero");
    const [engine, setEngine] = useState<VoiceEngine>("loading");
    const [testing, setTesting] = useState(false);
    const [focused, setFocused] = useState(document.visibilityState === "visible");
    const hints = keywordHints(context, skills);
    const round = ROUNDS[interviewType] ?? interviewType;
    const track = company || role || "Skill practice";
    const sectionLine = sections.length === 0
        ? "No sections yet"
        : `${sections.length} Prepared Sections: ${sections.map((section, index) => `${index + 1}. ${section.name}`).join(" → ")}`;

    useEffect(() => watchVoiceEngine(setEngine), []);

    useEffect(() => {
        const read = () => setFocused(document.visibilityState === "visible");
        document.addEventListener("visibilitychange", read);
        return () => document.removeEventListener("visibilitychange", read);
    }, []);

    useEffect(() => {
        let stream: MediaStream | null = null;
        let timer = 0;
        let stop = false;
        void navigator.mediaDevices.getUserMedia({ video: true }).then((videoStream) => {
            if (stop) {
                videoStream.getTracks().forEach((track) => track.stop());
                return;
            }
            stream = videoStream;
            const video = videoRef.current;
            if (video) {
                video.srcObject = videoStream;
                void video.play().catch(() => {});
            }
            setCamera("Camera on");
            const Detector = (window as Window & { FaceDetector?: new () => { detect: (source: HTMLVideoElement) => Promise<unknown[]> } }).FaceDetector;
            if (!Detector || !video) {
                setFace("This browser has no face detector. The camera stays on this device and is not scored.");
                return;
            }
            const detector = new Detector();
            const tick = async () => {
                if (stop || !videoRef.current) {
                    return;
                }
                try {
                    const faces = (await detector.detect(videoRef.current)).length;
                    setFace(faces === 1 ? "Face detector: 1 face in frame" : faces === 0 ? "Face detector: no face in frame" : `Face detector: ${faces} faces in frame`);
                } catch {
                    setFace("The face detector could not read this frame.");
                }
                timer = window.setTimeout(() => { void tick(); }, 800);
            };
            void tick();
        }).catch(() => {
            if (!stop) {
                setCamera("Allow the camera to preview the room");
                setFace("");
            }
        });
        return () => {
            stop = true;
            window.clearTimeout(timer);
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    useEffect(() => {
        let stream: MediaStream | null = null;
        let audio: AudioContext | null = null;
        let frame = 0;
        let stop = false;
        void navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
            if (stop) {
                micStream.getTracks().forEach((track) => track.stop());
                return;
            }
            stream = micStream;
            setMic("Mic open");
            audio = new AudioContext();
            const analyser = audio.createAnalyser();
            analyser.fftSize = 64;
            audio.createMediaStreamSource(micStream).connect(analyser);
            const bins = new Uint8Array(analyser.frequencyBinCount);
            const draw = () => {
                if (stop) {
                    return;
                }
                analyser.getByteFrequencyData(bins);
                setLevels(Array.from(bins.slice(0, 16), (value) => Math.max(0.08, value / 255)));
                frame = requestAnimationFrame(draw);
            };
            draw();
            void openTurnEar({ onSpeechStart() {}, onSpeechEnd() {} }).then(async (ear) => {
                if (stop) {
                    await ear.destroy();
                    return;
                }
                setVad("Silero ready");
                await ear.destroy();
            }).catch(() => {
                if (!stop) {
                    setVad("Silero could not load");
                }
            });
        }).catch(() => {
            if (!stop) {
                setMic("Allow the microphone");
                setVad("Waiting for the microphone");
            }
        });
        return () => {
            stop = true;
            cancelAnimationFrame(frame);
            stream?.getTracks().forEach((track) => track.stop());
            void audio?.close();
        };
    }, []);

    function testVoice() {
        unlockInterviewerVoice();
        setTesting(true);
        void speakAsInterviewer("Hi. This is the interviewer voice.", () => {}).finally(() => setTesting(false));
    }

    return (
        <div className="studio ready-room">
            <header className="studio-nav">
                <p className="studio-brand"><span>pR</span> practiceRoom</p>
                <p className="studio-crumb">Studio / {title || "Practice"} · {round}</p>
                <button type="button" className="back-studio" onClick={onBack}>Back to studio</button>
                <p className={`state state-${status}`}>{status === "ready" ? "Session State: Ready" : status}</p>
            </header>
            {error ? <p className="studio-error">{error}</p> : null}
            <div className="studio-grid">
                <section className="launcher">
                    <h2>Interview Context & Materials</h2>
                    <div className="context-row">
                        <div>
                            <p className="studio-quiet">Role & Round</p>
                            <div className="pills">
                                <span className="chip on">{round}</span>
                                {persona ? <span className="chip">{PERSONAS[persona] ?? persona}</span> : null}
                                {role ? <span className="chip">{role}</span> : null}
                            </div>
                        </div>
                        <div>
                            <p className="studio-quiet">Company / Track</p>
                            <span className="chip">{source ? `${track} · ${source}` : track}</span>
                        </div>
                    </div>
                    <p className="studio-quiet">Resume & Job Description Context</p>
                    <div className="context-box">{context || "No resume or job description was added for this room."}</div>
                    <p className="studio-quiet">Whisper & AI Keyword Hints</p>
                    {hints.length > 0 ? (
                        <div className="pills">
                            {hints.map((hint) => <span key={hint} className="chip">{hint}</span>)}
                        </div>
                    ) : <p className="studio-quiet">Keywords appear when the notes name a project or a tool.</p>}
                    <details className="sections">
                        <summary>{sectionLine}</summary>
                        <ol>
                            {sections.map((section) => <li key={section.name}>{section.name} · {section.minutes} min</li>)}
                        </ol>
                    </details>
                </section>
                <section className="launcher">
                    <h2>Hardware & Local Engine Check</h2>
                    <div className="preview">
                        <video ref={videoRef} autoPlay playsInline muted />
                        <span className="frame" />
                        {face ? <p>{face}</p> : <p>{camera}</p>}
                    </div>
                    <p className="studio-quiet">The camera stays on this device. Accent, appearance, and emotion are not scored.</p>
                    <ul className="checks">
                        <li>
                            <span>Microphone & Silero VAD</span>
                            <i className="meter" aria-hidden="true">{levels.map((level, index) => <b key={index} style={{ transform: `scaleY(${level})` }} />)}</i>
                            <em>{mic} · {vad}</em>
                        </li>
                        <li>
                            <span>Kokoro ONNX Voice (af_heart)</span>
                            <button type="button" onClick={testVoice} disabled={engine !== "ready" || testing}>{testing ? "Speaking" : "Test Voice"}</button>
                            <em>{engine === "ready" ? "WASM loaded" : engine === "failed" ? "Voice failed to load" : "Loading WASM"}</em>
                        </li>
                        <li>
                            <span>Tab Focus Monitor</span>
                            <em>{focused ? "Ready · local only" : "This tab is hidden"}</em>
                        </li>
                    </ul>
                    <p className="studio-quiet">Entering asks this browser for the full screen. The interview still starts if you decline.</p>
                    <button type="button" className="prepare" onClick={onEnter} disabled={pending}>{pending ? "Opening…" : "Enter Live Interview Room →"}</button>
                </section>
            </div>
        </div>
    );
}
