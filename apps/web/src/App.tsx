import { useEffect, useRef, useState, type FormEvent } from "react";
import { cancelInterviewer, prepareInterviewerVoice, speakAsInterviewer, unlockInterviewerVoice } from "./interviewer-voice";
import { apiUrl } from "./apiBase";

prepareInterviewerVoice("No problem at all.");
prepareInterviewerVoice("That makes sense.");
import { openTurnEar, wavFromSpeech, type TurnEar } from "./turn-vad";
import "./App.css";
import { Dashboard } from "./dashboard/Dashboard";
import { ReadyRoom } from "./dashboard/ReadyRoom";
import { LiveStage } from "./room/LiveStage";
import { canRun, editorLanguage, starterFor } from "./room/coding-problem";
import { ReportView } from "./room/ReportView";

type Account = {
    id: string;
    name: string;
    email: string;
    targetRole: string;
    experienceLevel: string;
    goal: string;
};

function api(input: string, init: RequestInit = {}) {
    return fetch(input, { ...init, credentials: "include" });
}

function profileReady(account: Account) {
    return Boolean(account.targetRole && account.experienceLevel && account.goal);
}

type CreatedInterview={
    id: string;
    status: string;
    title?: string;
    interviewType: string,
    sections: {name: string; minutes: number}[];
    sourceUrls: string[];
    practiceMode?: string;
    durationMinutes?: number;
    startedAt?: string | null;
    startsAt?: string | null;
    wrapUpUntil?: string | null;
    company?: string;
    role?: string;
    skills?: string[];
    context?: string;
    source?: string;
    persona?: string;
    codingLanguage?: string;
    prompt?: string;
};
type StarStatus={
    situation: boolean;
    task: boolean;
    action: boolean;
    result: boolean;
};
type InterviewTurn={
    status: string;
    sectionName: string;
    prompt: string;
    hint?: string;
    starStatus?: StarStatus;
    done: boolean;
};
type SpokenLine={
    role: "interviewer" | "you";
    text: string;
};
type FeedbackCriterion={
    name: string;
    score: number;
    evidence: string;
    explanation: string;
    confidence: string;
};
type ScoreFigure={
    name: string;
    score: number;
    detail: string;
    needsWork: boolean;
};
type QuestionScore={
    prompt: string;
    score: number;
    note: string;
    worked?: string;
    missing?: string;
    action?: string;
    honestPass?: boolean;
};
type TurnMeasure={
    prompt: string;
    wpm: number;
    thinkSeconds: number;
    seconds: number;
    action: string;
};
type InterviewReport={
    status: string;
    overallScore: number;
    criteria: FeedbackCriterion[];
    strengths: string[];
    improvements: string[];
    practiceTopics: string[];
    content?: ScoreFigure[];
    delivery?: ScoreFigure[];
    presence?: ScoreFigure[];
    questions?: QuestionScore[];
    idealAnswer?: string;
    focus?: string[];
    pillars?: ScoreFigure[];
    turns?: TurnMeasure[];
    brushUp?: string[];
    said?: { prompt: string; answer: string; outcome?: string; action?: string }[];
};
type InterviewSummary={
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

function openingLine(topic: string) {
    const role = topic.trim() || "this role";
    return `Hi, thanks for joining. I'll let you start us off for ${role}. Say hello, tell me your name, and a little about yourself.`;
}

function spokenLine(prompt: string){
    const tagged = prompt.match(/<spoken_line>([\s\S]*?)<\/spoken_line>/i)?.[1]
        ?? prompt.match(/<prompt>([\s\S]*?)<\/prompt>/i)?.[1]
        ?? "";
    const match = prompt.match(/"(?:spoken_line|prompt)"\s*:\s*"((?:\\.|[^"\\])*)/);
    const recovered = (tagged || (match ? match[1].replace(/\\n/g, " ").replace(/\\"/g, '"') : "")).trim();
    const leaked = prompt.trim().startsWith("{") || prompt.includes('"action"') || /<action\b/i.test(prompt);
    const source = /[.?!]["']?$/.test(recovered) && !recovered.includes('"action"') && !/<action\b/i.test(recovered)
        ? recovered
        : leaked
            ? "What did you personally own in that project, and what changed because of your work?"
            : prompt;
    const text = source.replace(/\s+/g, " ").trim();
    const noise = /browser extension|salary calculator|employees choice|hello, guest|rate now|are you paid fairly|login for employers|compare companies/i;
    const usable = !noise.test(text) && text.length <= 900
        ? text
        : text.match(/[A-Z][^?]{12,160}\?/g)?.find((line) => !noise.test(line))?.trim()
            || "Tell me about a project you owned. What was your part in it?";
    const sentences = usable.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [usable];
    return sentences.slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
}

function readableResume(text: string) {
    const joined = text
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => (line.match(/[A-Za-z]/g) ?? []).length >= 3)
        .join("\n")
        .trim();
    const letters = (joined.match(/[A-Za-z]/g) ?? []).length;
    return letters >= 40 ? joined.slice(0, 4000) : "";
}

async function readPdfResume(file: File){
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const data = new Uint8Array(await file.arrayBuffer());
    const document = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let number = 1; number <= Math.min(document.numPages, 4); number += 1) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return readableResume(pages.join("\n"));
}

async function readResumeFile(file: File){
    const name = file.name.toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
        return readableResume(await file.text());
    }
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
        try {
            const text = await readPdfResume(file);
            if (text) {
                return text;
            }
        } catch {
            return "";
        }
    }
    const raw = new TextDecoder("latin1").decode(await file.arrayBuffer());
    const extracted = [...raw.matchAll(/\((?:\\\)|[^)\\]){12,}\)/g)]
        .map((match) => match[0].slice(1, -1).replace(/\\n/g, "\n").replace(/\\(.)/g, "$1"))
        .join("\n");
    return readableResume(extracted);
}

function askFullscreen() {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) {
        return;
    }
    void document.documentElement.requestFullscreen().catch(() => {});
}

function leaveFullscreen() {
    if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
    }
}

type ClockHold = { id: string; pausedMs: number; leftAt: number | null };

function readClock(): ClockHold | null {
    try {
        const raw = sessionStorage.getItem("practice-room-clock");
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<ClockHold>;
        if (!parsed.id || typeof parsed.pausedMs !== "number") {
            return null;
        }
        return { id: parsed.id, pausedMs: parsed.pausedMs, leftAt: typeof parsed.leftAt === "number" ? parsed.leftAt : null };
    } catch {
        return null;
    }
}

function writeClock(hold: ClockHold | null) {
    try {
        if (!hold) {
            sessionStorage.removeItem("practice-room-clock");
            return;
        }
        sessionStorage.setItem("practice-room-clock", JSON.stringify(hold));
    } catch {
        // The timer still works for this page view.
    }
}

export default function App(){
    const [result, setResult]=useState<CreatedInterview|null>(null);
    const [error, setError]=useState("");
    const [mode, setMode]=useState<"job" | "skill">("job");
    const [company, setCompany]=useState("Google");
    const [role, setRole]=useState("Software Engineer");
    const [description, setDescription]=useState("Build reliable backend services.");
    const [skills, setSkills]=useState("JavaScript");
    const [interviewType, setInterviewType]=useState("technical");
    const [codingLanguage, setCodingLanguage]=useState("typescript");
    const [goal, setGoal]=useState("");
    const [experienceLevel, setExperienceLevel]=useState("mid");
    const [difficulty, setDifficulty]=useState("medium");
    const [persona, setPersona]=useState("coach");
    const [practiceMode, setPracticeMode]=useState("coach");
    const [durationMinutes, setDurationMinutes]=useState(30);
    const [resume, setResume]=useState("");
    const [resumeName, setResumeName]=useState("");
    const [materials, setMaterials]=useState("");
    const [userName, setUserName]=useState("");
    const [spokenName, setSpokenName]=useState(() => localStorage.getItem("practice-room-spoken-name") ?? "");
    const [studioView, setStudioView]=useState<"overview" | "rooms" | "brush" | "banks">("overview");
    const [account, setAccount]=useState<Account | null>(null);
    const [authReady, setAuthReady]=useState(false);
    const [authMode, setAuthMode]=useState<"login" | "signup">("signup");
    const [email, setEmail]=useState("");
    const [password, setPassword]=useState("");
    const [authPending, setAuthPending]=useState(false);
    const [agreed, setAgreed]=useState(false);
    const [draftName, setDraftName]=useState("");
    const [speaker, setSpeaker]=useState<"" | "interviewer" | "candidate">("");
    const [voicePhase, setVoicePhase]=useState<"" | "preparing" | "speaking">("");
    const [audible, setAudible]=useState("");

    const [turn, setTurn]=useState<InterviewTurn|null>(null);
    const [clockNow, setClockNow]=useState(() => Date.now());
    const pausedMs = useRef(0);
    const clockPause = useRef<ClockHold | null>(readClock());
    const clockTimer = useRef(0);
    const [lines, setLines]=useState<SpokenLine[]>([]);

    const [answer, setAnswer]=useState("");
    const [code, setCode]=useState("");
    const [problemText, setProblemText]=useState("");
    const [consoleText, setConsoleText]=useState("");
    const [codeRunning, setCodeRunning]=useState(false);

    const [report, setReport]=useState<InterviewReport|null>(null);
    const [interviews, setInterviews]=useState<InterviewSummary[]>([]);
    const [pending, setPending]=useState<"" | "create" | "start" | "hear" | "answer" | "report" | "end">("");
    const [place, setPlace]=useState<"lobby" | "briefing" | "room">("lobby");
    const [presence, setPresence]=useState("Camera off");
    const [tabFocused, setTabFocused]=useState(!document.hidden);
    const [micLevels, setMicLevels]=useState<number[]>(() => Array.from({ length: 8 }, () => 0.15));

    const videoRef=useRef<HTMLVideoElement>(null);
    const cameraStream=useRef<MediaStream | null>(null);
    const cameraRequest=useRef(0);
    const cameraAllowed=useRef(false);
    const releaseCameraRef=useRef<() => void>(() => {});
    const speakToken=useRef(0);
    const spokenPrompt=useRef("");
    const keepListening=useRef(false);
    const recognitionRef=useRef<{ stop: () => void } | null>(null);
    const micStream=useRef<MediaStream | null>(null);
    const voicePhaseRef=useRef<"" | "preparing" | "speaking">("");
    const pendingRef=useRef<"" | "create" | "start" | "hear" | "answer" | "report" | "end">("");
    const earRef=useRef<TurnEar | null>(null);
    const submitSpeechRef=useRef<(audio: Float32Array) => void>(() => {});
    const recorderRef=useRef<MediaRecorder | null>(null);
    const speechChunks=useRef<Blob[]>([]);
    const listenRef=useRef<(continuing?: boolean) => void>(() => {});
    const committedRef=useRef("");
    const sessionTextRef=useRef("");
    const editingRef=useRef(false);
    const listenStarted=useRef(0);
    const questionReady=useRef(0);
    const firstHeard=useRef(0);
    const tabHidden=useRef(0);
    const tabAwayMs=useRef(0);
    const hiddenAt=useRef(0);
    const interviewTypeRef=useRef("");
    const codeRef=useRef("");
    const answerRef=useRef("");
    const speakRef=useRef<(text: string) => void>(() => {});
    const codeQuiet=useRef("");
    interviewTypeRef.current = result?.interviewType ?? "";
    codeRef.current = code;
    answerRef.current = answer;
    const [cameraReady, setCameraReady]=useState(false);
    const screenRef=useRef<HTMLVideoElement>(null);
    
    useEffect(()=>{
        return ()=>{
         cameraStream.current?.getTracks().forEach((track) => track.stop());
         const screen=screenRef.current?.srcObject;
         if(screen instanceof MediaStream){
            screen.getTracks().forEach((track)=>track.stop());
         }
       }
    },[])
    useEffect(()=>{
        const video=videoRef.current;
        const stream=cameraStream.current;
        if(!cameraAllowed.current || !video || !stream || video.srcObject === stream){
            return;
        }
        video.srcObject=stream;
        void video.play().catch(()=>{});
    })
    useEffect(()=>{
        if(result?.status === "live"){
            return;
        }
        releaseCameraRef.current();
    }, [result?.id, result?.status]);
    function startRecorder(stream: MediaStream){
        if(recorderRef.current && recorderRef.current.state !== "inactive"){
            return;
        }
        speechChunks.current=[];
        let recorder: MediaRecorder;
        try{
            recorder=new MediaRecorder(stream);
        }catch{
            return;
        }
        recorder.ondataavailable=(event)=>{
            if(event.data.size > 0){
                speechChunks.current.push(event.data);
            }
        };
        recorder.start(1000);
        recorderRef.current=recorder;
    }
    function finishRecording(){
        const recorder=recorderRef.current;
        if(!recorder || recorder.state === "inactive"){
            const blob=speechChunks.current.length ? new Blob(speechChunks.current, {type: "audio/webm"}) : null;
            speechChunks.current=[];
            return Promise.resolve(blob && blob.size > 0 ? blob : null);
        }
        return new Promise<Blob | null>((resolve)=>{
            recorder.onstop=()=>{
                const blob=new Blob(speechChunks.current, {type: recorder.mimeType || "audio/webm"});
                speechChunks.current=[];
                recorderRef.current=null;
                resolve(blob.size > 0 ? blob : null);
            };
            recorder.stop();
        });
    }
    async function blobToBase64(blob: Blob){
        const bytes=new Uint8Array(await blob.arrayBuffer());
        let binary="";
        for(let index=0; index<bytes.length; index+=0x8000){
            binary+=String.fromCharCode(...bytes.subarray(index, index+0x8000));
        }
        return btoa(binary);
    }
    function stopListening(){
        keepListening.current = false;
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        micStream.current?.getTracks().forEach((track) => track.stop());
        micStream.current = null;
    }
    function beginSpeech(text: string) {
        const line = spokenLine(text);
        const token = ++speakToken.current;
        spokenPrompt.current = line;
        tabHidden.current = 0;
        tabAwayMs.current = 0;
        hiddenAt.current = 0;
        stopListening();
        void earRef.current?.pause();
        unlockInterviewerVoice();
        setVoicePhase("preparing");
        setAudible("");
        setSpeaker("");
        void speakAsInterviewer(line, (phase, heard) => {
            if (speakToken.current !== token) {
                return;
            }
            setVoicePhase(phase);
            if (heard) {
                setAudible(heard);
            }
            setSpeaker(phase === "speaking" ? "interviewer" : "");
        }).finally(() => {
            if (speakToken.current !== token) {
                return;
            }
            setSpeaker("");
            setVoicePhase("");
            questionReady.current = Date.now();
            firstHeard.current = 0;
            listenRef.current();
            void earRef.current?.start();
        });
    }
    function freezeLiveClock(id: string) {
        const held = clockPause.current ?? readClock();
        if (held?.id === id && held.leftAt != null) {
            return;
        }
        const next = { id, pausedMs: held?.id === id ? held.pausedMs : pausedMs.current, leftAt: Date.now() };
        clockPause.current = next;
        pausedMs.current = next.pausedMs;
        writeClock(next);
        window.clearInterval(clockTimer.current);
        clockTimer.current = 0;
    }
    useEffect(() => {
        const inRoom = place === "room" && result?.status === "live" && Boolean(result.startedAt) && !turn?.done;
        if (!inRoom || !result?.id) {
            const held = clockPause.current ?? readClock();
            if (held && held.leftAt == null) {
                const frozen = { ...held, leftAt: Date.now() };
                clockPause.current = frozen;
                writeClock(frozen);
            }
            return;
        }
        const id = result.id;
        const held = clockPause.current ?? readClock();
        const paused = held?.id === id ? held.pausedMs + (held.leftAt ? Date.now() - held.leftAt : 0) : 0;
        pausedMs.current = paused;
        const running = { id, pausedMs: paused, leftAt: null };
        clockPause.current = running;
        writeClock(running);
        setClockNow(Date.now());
        window.clearInterval(clockTimer.current);
        clockTimer.current = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => {
            window.clearInterval(clockTimer.current);
            clockTimer.current = 0;
            const current = clockPause.current;
            if (current?.id === id && current.leftAt == null) {
                const frozen = { id, pausedMs: pausedMs.current, leftAt: Date.now() };
                clockPause.current = frozen;
                writeClock(frozen);
            }
        };
    }, [place, result?.status, result?.startedAt, result?.id, turn?.done]);
    useEffect(() => {
        if (place !== "briefing" || !result?.id) {
            return;
        }
        if (result.status !== "preparing") {
            return;
        }
        const id = result.id;
        const poll = window.setInterval(() => {
            void refreshScheduled(id);
        }, 4000);
        return () => {
            window.clearInterval(poll);
        };
    }, [place, result?.id, result?.status]);
    useEffect(() => {
        const read = () => setTabFocused(!document.hidden);
        document.addEventListener("visibilitychange", read);
        return () => document.removeEventListener("visibilitychange", read);
    }, []);
    useEffect(() => {
        if (place !== "room" || result?.status !== "live") {
            return;
        }
        let stop = false;
        let timer = 0;
        const Detector = (window as Window & { FaceDetector?: new () => { detect: (source: HTMLVideoElement) => Promise<unknown[]> } }).FaceDetector;
        const tick = async () => {
            if (stop) {
                return;
            }
            const video = videoRef.current;
            if (!video || video.readyState < 2 || !Detector) {
                setPresence(cameraReady ? "Camera on" : "Camera off");
            } else {
                try {
                    const count = (await new Detector().detect(video)).length;
                    setPresence(count === 1 ? "1 face" : count === 0 ? "No face" : `${count} faces`);
                } catch {
                    setPresence("Camera on");
                }
            }
            timer = window.setTimeout(() => { void tick(); }, 1000);
        };
        void tick();
        return () => {
            stop = true;
            window.clearTimeout(timer);
        };
    }, [place, result?.status, cameraReady]);
    useEffect(() => {
        if (speaker !== "candidate") {
            return;
        }
        let audio: AudioContext | null = null;
        let frame = 0;
        let stop = false;
        const wait = window.setInterval(() => {
            const stream = micStream.current;
            if (!stream || stop || audio) {
                return;
            }
            audio = new AudioContext();
            const analyser = audio.createAnalyser();
            analyser.fftSize = 32;
            audio.createMediaStreamSource(stream).connect(analyser);
            const bins = new Uint8Array(analyser.frequencyBinCount);
            const draw = () => {
                if (stop) {
                    return;
                }
                analyser.getByteFrequencyData(bins);
                setMicLevels(Array.from(bins.slice(0, 8), (value) => Math.max(0.15, value / 255)));
                frame = requestAnimationFrame(draw);
            };
            draw();
        }, 200);
        return () => {
            stop = true;
            window.clearInterval(wait);
            cancelAnimationFrame(frame);
            void audio?.close();
        };
    }, [speaker]);

    useEffect(() => {
        if (place !== "room" || result?.status !== "live") {
            void earRef.current?.destroy();
            earRef.current = null;
            return;
        }
        let cancelled = false;
        void openTurnEar({
            onSpeechStart: () => {},
            onSpeechEnd: (audio) => {
                submitSpeechRef.current(audio);
            },
        }).then((ear) => {
            if (cancelled) {
                void ear.destroy();
                return;
            }
            earRef.current = ear;
            if (voicePhaseRef.current === "") {
                void ear.start();
            }
        }).catch(() => {});
        return () => {
            cancelled = true;
            void earRef.current?.destroy();
            earRef.current = null;
        };
    }, [place, result?.id, result?.status]);
    useEffect(() => {
        if (place !== "room" || result?.status !== "live" || result.interviewType !== "coding" || turn?.sectionName === "Introduction" || !turn?.prompt || turn.done || voicePhase !== "") {
            return;
        }
        const question = turn.prompt;
        if (codeQuiet.current === question) {
            return;
        }
        const codeAtStart = code;
        const answerAtStart = answer.trim();
        const timer = window.setTimeout(() => {
            if (codeRef.current !== codeAtStart || answerRef.current.trim() !== answerAtStart || voicePhaseRef.current !== "") {
                return;
            }
            codeQuiet.current = question;
            speakRef.current("Take your time. Talk me through the approach you're considering so far.");
        }, 25000);
        return () => window.clearTimeout(timer);
    }, [place, result?.status, result?.interviewType, turn?.sectionName, turn?.prompt, turn?.done, voicePhase, code, answer]);
    useEffect(() => {
        void api(apiUrl("/api/v1/auth/me")).then(async (response) => {
            if (response.ok) {
                const next = await response.json() as Account;
                setAccount(next);
                setUserName(next.name);
                if (next.targetRole) {
                    setRole(next.targetRole);
                }
                if (next.experienceLevel) {
                    setExperienceLevel(next.experienceLevel);
                }
                if (next.goal) {
                    setGoal(next.goal);
                }
            }
            setAuthReady(true);
        });
    }, []);
    useEffect(()=>{
        if (account) {
            void loadInterviews();
        }
        const onHide=() => {
            if(interviewTypeRef.current === "coding"){
                return;
            }
            if(document.hidden){
                tabHidden.current += 1;
                hiddenAt.current = Date.now();
                return;
            }
            if(hiddenAt.current){
                tabAwayMs.current += Date.now() - hiddenAt.current;
                hiddenAt.current = 0;
            }
        };
        document.addEventListener("visibilitychange", onHide);
        return () => document.removeEventListener("visibilitychange", onHide);
    }, [account]);
    function listenForAnswer(continuing = false){
        const previous=recognitionRef.current;
        recognitionRef.current=null;
        keepListening.current=true;
        if(!continuing){
            committedRef.current=answer.trim();
            sessionTextRef.current="";
            listenStarted.current=Date.now();
            firstHeard.current=0;
        }
        previous?.stop();
        const speechWindow=window as Window & {
            SpeechRecognition?: new()=>{
                lang: string;
                continuous: boolean;
                interimResults: boolean;
                start: ()=>void;
                stop: ()=>void;
                onresult:((event: {results: ArrayLike<{isFinal: boolean; 0: {transcript: string}}>})=> void) | null;
                onend: (()=> void) | null;
                onerror:((event: {error?: string})=> void) | null;
            };
            webkitSpeechRecognition?: new()=>{
                lang: string;
                continuous: boolean;
                interimResults: boolean;
                start: ()=> void;
                stop: ()=>void;
                onresult:((event: {results: ArrayLike<{isFinal: boolean; 0: {transcript: string}}>})=> void) | null;
                onend: (()=> void) | null;
                onerror: ((event: {error?: string})=> void)| null;
            };
        };
        const Recognition=speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
        if(!Recognition){
            setError("Speech recognition is not available in this browser.")
            return;
        }
        const recognition= new Recognition();
        recognition.lang="en-IN";
        recognition.continuous=true;
        recognition.interimResults=true;
        const showHeard=()=>{
            const said=[committedRef.current, sessionTextRef.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
            if(said && !firstHeard.current){
                firstHeard.current=Date.now();
            }
            if(!editingRef.current){
                setAnswer(said);
            }
        };
        recognition.onresult=(event)=>{
            const heard: string[]=[];
            for(let index=0; index<event.results.length; index+=1){
                heard.push(event.results[index][0].transcript);
            }
            sessionTextRef.current=heard.join(" ").replace(/\s+/g, " ").trim();
            showHeard();
        };
        recognition.onend=()=>{
            if(sessionTextRef.current){
                committedRef.current=[committedRef.current, sessionTextRef.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
                sessionTextRef.current="";
                if(!editingRef.current){
                    setAnswer(committedRef.current);
                }
            }
            if(keepListening.current && recognitionRef.current === recognition){
                recognitionRef.current=null;
                window.setTimeout(()=>{
                    if(keepListening.current){
                        listenRef.current(true);
                    }
                }, 250);
                return;
            }
            if(recognitionRef.current === recognition){
                setSpeaker("");
            }
        };
        recognition.onerror=(event)=>{
            const code=event.error ?? "";
            if(code === "no-speech" || code === "aborted" || code === "network"){
                return;
            }
            keepListening.current=false;
            setSpeaker("");
            setError(code === "not-allowed" ? "Allow the microphone, or type the answer." : "The microphone paused. The words already heard are kept. Type the rest, or speak again.");
        };
        recognitionRef.current=recognition;
        setSpeaker("candidate");
        setError("");
        if(micStream.current){
            startRecorder(micStream.current);
        }else{
            void navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
            }).then((stream) => {
                if(!keepListening.current){
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                micStream.current=stream;
                startRecorder(stream);
            }).catch(() => {});
        }
        try{
            recognition.start();
        }catch{
            keepListening.current=false;
            setError("Could not hear an answer. Type it, or speak again.");
        }
    }
    listenRef.current=listenForAnswer;
    speakRef.current=beginSpeech;
    function rearmTurn(){
        setPending("");
        setVoicePhase("");
        setError("Didn't catch that clearly. Try speaking a bit closer to the mic.");
        listenRef.current();
        void earRef.current?.pause().then(() => earRef.current?.start()).catch(() => {});
    }
    function releaseCamera(){
        cameraAllowed.current=false;
        cameraRequest.current += 1;
        const streams=new Set<MediaStream>();
        if(cameraStream.current){
            streams.add(cameraStream.current);
        }
        const video=videoRef.current;
        if(video?.srcObject instanceof MediaStream){
            streams.add(video.srcObject);
        }
        cameraStream.current=null;
        for(const stream of streams){
            stream.getTracks().forEach((track)=>track.stop());
        }
        if(video){
            video.srcObject=null;
            video.load();
        }
        setCameraReady(false);
    }
    function showCamera(stream: MediaStream){
        if(!cameraAllowed.current){
            stream.getTracks().forEach((track)=>track.stop());
            return;
        }
        cameraStream.current=stream;
        const video=videoRef.current;
        if(video){
            video.srcObject=stream;
            void video.play().catch(()=>{});
        }
        setCameraReady(true);
    }
    async function startCamera(){
        setError("");
        cameraAllowed.current=true;
        const existing=cameraStream.current;
        if(existing?.getVideoTracks().some((track)=>track.readyState === "live")){
            showCamera(existing);
            return;
        }
        const request=cameraRequest.current + 1;
        cameraRequest.current=request;
        try{
            const stream=await navigator.mediaDevices.getUserMedia({
                video: true,
                audio:false,
            });
            if(!cameraAllowed.current || request !== cameraRequest.current){
                stream.getTracks().forEach((track)=>track.stop());
                return;
            }
            showCamera(stream);
        }catch{
            if(cameraAllowed.current && request === cameraRequest.current){
                setCameraReady(false);
                setError("The camera could not start.");
            }
        }
    }
    releaseCameraRef.current=releaseCamera;
      async function loadInterviews(){
        const response=await api(apiUrl("/api/v1/interviews"));
         if(response.ok){
            setInterviews(await response.json());
         }
      }
      async function deleteInterview(id: string) {
        setError("");
        const open = result?.id === id;
        if (open) {
          cancelInterviewer();
          stopListening();
          releaseCamera();
        }
        const response = await api(apiUrl(`/api/v1/interviews/${id}`), { method: "DELETE" });
        if (!response.ok) {
          setError(`Delete failed: ${response.status}`);
          return;
        }
        if (open) {
          sessionStorage.removeItem("practice-room-interview");
          setPlace("lobby");
          setResult(null);
          setTurn(null);
          setReport(null);
          setAnswer("");
          setCode("");
        }
        void loadInterviews();
      }
      async function refreshScheduled(id: string) {
        const response = await api(apiUrl(`/api/v1/interviews/${id}`));
        if (!response.ok) {
          return;
        }
        const saved = await response.json() as {
          status: string;
          title?: string;
          sections?: {name: string; minutes: number}[];
          sourceUrls?: string[];
          startsAt?: string | null;
          context?: string;
          source?: string;
          problem?: string;
        };
        setResult((current) => current?.id === id ? {
          ...current,
          status: saved.status,
          title: saved.title || current.title,
          sections: saved.sections ?? current.sections,
          sourceUrls: saved.sourceUrls ?? current.sourceUrls,
          startsAt: saved.startsAt ?? current.startsAt,
          context: saved.context ?? current.context,
          source: saved.source ?? current.source,
        } : current);
        if (saved.problem) {
          setProblemText(saved.problem);
        }
        if (saved.status === "failed") {
          setError("The questions could not be prepared. Go back and prepare the room again.");
        }
      }
      async function openInterview(id: string) {
        setError("");
        const response = await api(apiUrl(`/api/v1/interviews/${id}`));
        if (!response.ok) {
          setError("That interview is no longer available.");
          return;
        }
        const saved = await response.json();
        if (result?.id !== saved.id) {
          releaseCamera();
        }
        await showInterview(saved);
      }
      async function showInterview(saved: {
        id: string;
        status: string;
        title?: string;
        interviewType: string;
        sections: {name: string; minutes: number}[];
        sourceUrls: string[];
        practiceMode?: string;
        durationMinutes?: number;
        startedAt?: string | null;
        startsAt?: string | null;
        wrapUpUntil?: string | null;
        company?: string;
        role?: string;
        skills?: string[];
        context?: string;
        source?: string;
        persona?: string;
        prompt?: string;
        problem?: string;
        codingLanguage?: string;
        preload?: string;
        sectionName?: string;
        done?: boolean;
        feedback?: InterviewReport | null;
        said?: InterviewReport["said"];
      }) {
        stopListening();
        setLines([]);
        setAnswer("");
        setCode(saved.interviewType === "coding" && saved.status === "live" ? starterFor(editorLanguage(saved.title || "", saved.codingLanguage)) : "");
        setReport(saved.feedback ? { ...saved.feedback, said: saved.said ?? saved.feedback.said } : null);
        setProblemText(saved.problem || "");
        sessionStorage.setItem("practice-room-interview", saved.id);
        setResult({
          id: saved.id,
          status: saved.status,
          title: saved.title,
          interviewType: saved.interviewType,
          sections: saved.sections,
          sourceUrls: saved.sourceUrls,
          practiceMode: saved.practiceMode,
          durationMinutes: saved.durationMinutes,
          startedAt: saved.startedAt,
          startsAt: saved.startsAt,
          wrapUpUntil: saved.wrapUpUntil,
          company: saved.company,
          role: saved.role,
          skills: saved.skills,
          context: saved.context,
          source: saved.source,
          persona: saved.persona,
          codingLanguage: saved.codingLanguage,
          prompt: saved.prompt,
        });
        const held = saved.status === "preparing" || saved.status === "failed";
        if (saved.status === "ready" || held) {
          setPlace("briefing");
          if (saved.status === "ready") {
            unlockInterviewerVoice();
            const opening = spokenLine(saved.interviewType === "behavioral" && saved.prompt ? saved.prompt : openingLine(saved.title || ""));
            prepareInterviewerVoice(opening);
            if (saved.preload) {
              prepareInterviewerVoice(spokenLine(saved.preload));
            }
          }
          if (saved.status === "failed") {
            setError("The questions could not be prepared. Go back and prepare the room again.");
          }
          return;
        }
        setPlace("room");
        if (saved.prompt) {
          setTurn({
            status: saved.status,
            sectionName: saved.sectionName ?? "",
            prompt: saved.prompt,
            done: Boolean(saved.done),
          });
          setLines([{role: "interviewer", text: spokenLine(saved.prompt)}]);
        } else {
          setTurn(null);
          setLines([]);
        }
        if (saved.status === "live" && saved.prompt && !saved.done) {
          unlockInterviewerVoice();
          if (!/^problem statement/i.test(saved.prompt)) {
            beginSpeech(saved.prompt);
          }
          void startCamera();
        }
      }
      function backToLobby() {
        if (place === "room" && result?.status === "live" && result.startedAt && !turn?.done) {
            freezeLiveClock(result.id);
        }
        leaveFullscreen();
        cancelInterviewer();
        stopListening();
        releaseCamera();
        setPlace("lobby");
        setTurn(null);
        setLines([]);
        setResult(null);
        setReport(null);
        setAnswer("");
        setCode("");
        setProblemText("");
        setSpeaker("");
        setVoicePhase("");
      }
    async function createInterview(){
        setError("");
        setTurn(null);
        setReport(null);
        setAnswer("");
        setCode("");
        setPending("create");
      if(mode === "job" && (!company.trim() || !role.trim())){
            setError("Add a company and a role.");
            setPending("");
            return;
        }
      if(interviewType === "technical" && !resume.trim()){
            setError("Add a resume for a technical round. The questions come from it, plus a puzzle and the job requirements.");
            setPending("");
            return;
        }
      const body = mode === "job"
        ? {
            mode,
            company: company.trim(),
            role: role.trim(),
            description: description.trim() || `${role.trim()} at ${company.trim()}. ${interviewType} interview.`,
            interviewType,
            ...(interviewType === "coding" ? { codingLanguage } : {}),
            experienceLevel,
            difficulty,
            durationMinutes: Number(durationMinutes),
            persona,
            practiceMode,
            ...(resume.trim() ? { resume: resume.trim() } : {}),
            ...(materials.trim() ? { materials: materials.trim() } : {}),
        }
        : {
            mode,
            skills: skills.split(",").map((skill) => skill.trim()).filter(Boolean),
            interviewType,
            ...(interviewType === "coding" ? { codingLanguage } : {}),
            experienceLevel,
            difficulty,
            durationMinutes: Number(durationMinutes),
            persona,
            practiceMode,
            ...(resume.trim() ? { resume: resume.trim() } : {}),
            ...(materials.trim() ? { materials: materials.trim() } : {}),
        };
        try {
        const response=await api(apiUrl("/api/v1/interviews"), {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
        });
        if(!response.ok){
            const detail = await response.json().catch(() => null) as {message?: string | string[]} | null;
            const message = Array.isArray(detail?.message) ? detail.message.join(" ") : detail?.message;
            setError(message && message !== "Internal server error" ? message : `Create failed: ${response.status}`);
            return;
        }
        const created=await response.json();
        releaseCamera();
        await showInterview(created);
        void loadInterviews();
        } finally {
            setPending("");
        }
    }
    async function startInterview(){
        askFullscreen();
        unlockInterviewerVoice();
        if(!result){
            return;
        }
        const codingRoom = result.interviewType === "coding";
        const behavioralRoom = result.interviewType === "behavioral";
        const greeting = behavioralRoom
            ? (result.prompt ? spokenLine(result.prompt) : "")
            : spokenLine(openingLine(result.title || ""));
        if (codingRoom && !code.trim()) {
            setCode(starterFor(editorLanguage(result.title || "", result.codingLanguage)));
        }
        setPlace("room");
        setTurn({ status: "live", sectionName: behavioralRoom ? (result.sections[0]?.name || "Warm-up & Pitch") : "Introduction", prompt: greeting, done: false });
        setLines(greeting ? [{ role: "interviewer", text: greeting }] : []);
        setResult({ ...result, status: "live" });
        if (greeting) {
            beginSpeech(greeting);
        }
        setError("");
        setPending("start");
        try {
        const response=await api(
            apiUrl(`/api/v1/interviews/${result.id}/start`),
            {method: "POST"},
        );
        if(!response.ok){
            cancelInterviewer();
            setPlace("briefing");
            setResult({ ...result, status: "ready" });
            setError(await response.text() || `Start failed: ${response.status}`);
            return;
        }
        const next=await response.json();
        const shown = (next.sectionName === "Introduction" || result.interviewType === "behavioral") && typeof next.prompt === "string" && next.prompt.trim() ? spokenLine(next.prompt) : greeting;
        if (typeof next.problem === "string" && next.problem.trim()) {
            setProblemText(next.problem);
        }
        setTurn({ ...next, prompt: shown, sectionName: next.sectionName || (result.interviewType === "behavioral" ? (result.sections[0]?.name || "Warm-up & Pitch") : "Introduction") });
        if (result.interviewType === "behavioral" && shown && shown !== greeting) {
            beginSpeech(shown);
        }
        if (typeof next.preload === "string" && next.preload.trim()) {
            prepareInterviewerVoice(spokenLine(next.preload));
        }
        setLines([{role: "interviewer", text: spokenLine(shown)}]);
        setResult({...result, status: next.status, durationMinutes: next.durationMinutes ?? result.durationMinutes, startedAt: next.startedAt ?? result.startedAt, wrapUpUntil: next.wrapUpUntil ?? result.wrapUpUntil});
        if(next.status === "live"){
            void startCamera();
        }
        void loadInterviews();
        } finally {
            setPending("");
        }
    }
    async function submitAnswer(supplied?: Blob, typed?: string){
        if(!result || !turn || turn.done){
            return;
        }
        if(pendingRef.current === "hear" || pendingRef.current === "answer"){
            return;
        }
        const line=typed?.trim() ?? "";
        const recording=line ? null : supplied ?? await finishRecording();
        stopListening();
        setError("");
        setVoicePhase("preparing");
        setAudible("");
        setPending(line ? "answer" : "hear");
        let spoken=line || answer.trim();
        let fromWhisper=false;
        if(recording && result){
            try{
                const response=await api(apiUrl(`/api/v1/interviews/${result.id}/transcribe`), {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        audio: await blobToBase64(recording),
                        mime: recording.type || "audio/webm",
                        hint: [spokenLine(turn.prompt), resume].filter(Boolean).join(" ").slice(0, 400),
                    }),
                });
                const heard=response.ok ? await response.json() as {text?: string; error?: string} : {error: "Whisper could not transcribe the recording."};
                if(heard.text?.trim()){
                    spoken=heard.text.trim();
                    fromWhisper=true;
                    setAnswer(spoken);
                }else{
                    rearmTurn();
                    return;
                }
            }catch{
                rearmTurn();
                return;
            }
        }
        setPending("answer");
        const fillers=(spoken.match(/\b(um|uh|like|basically|actually|you know)\b/gi) ?? []).length;
        let awayMs=tabAwayMs.current;
        if(document.hidden && hiddenAt.current && interviewTypeRef.current !== "coding"){
            awayMs += Date.now() - hiddenAt.current;
        }
        let faces: number | null=null;
        const video=videoRef.current;
        const Detector=(window as Window & {FaceDetector?: new()=>{detect:(source: HTMLVideoElement)=>Promise<unknown[]>}}).FaceDetector;
        if(video && Detector){
            try{
                faces=(await new Detector().detect(video)).length;
            }catch{
                faces=null;
            }
        }
        try {
        const response=await api(
            apiUrl(`/api/v1/interviews/${result.id}/answer`),
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    answer: spoken,
                    fromWhisper,
                    code: code.trim(),
                    signals: {
                        fillers,
                        words: spoken ? spoken.split(/\s+/).length : 0,
                        elapsedMs: listenStarted.current ? Date.now() - listenStarted.current : 0,
                        tabHidden: tabHidden.current,
                        tabAwayMs: awayMs,
                        faces,
                        latencyMs: firstHeard.current && questionReady.current ? firstHeard.current - questionReady.current : 0,
                        pausedMs: pausedMs.current,
                    },
                }),
            },
        );
        if(!response.ok){
            const raw = await response.text();
            setVoicePhase("");
            try {
                const detail = JSON.parse(raw) as {message?: string};
                setError(detail.message || raw);
            } catch {
                setError(raw || `Answer failed: ${response.status}`);
            }
            return;
        }
        const next=await response.json();
        const heard=typeof next.answer === "string" && next.answer.trim() ? next.answer.trim() : spoken;
        if (typeof next.problem === "string" && next.problem.trim()) {
            setProblemText(next.problem);
        }
        setTurn(next);
        setLines((current) => [
            ...current,
            ...(heard ? [{role: "you" as const, text: heard}] : []),
            ...(next.prompt && !next.done ? [{role: "interviewer" as const, text: spokenLine(next.prompt)}] : []),
        ]);
        setResult({...result, status: next.status, durationMinutes: next.durationMinutes ?? result.durationMinutes, startedAt: next.startedAt ?? result.startedAt, wrapUpUntil: next.wrapUpUntil ?? result.wrapUpUntil});
        void loadInterviews();
        setAnswer("");
        if (result.interviewType !== "coding") {
            setCode("");
            setConsoleText("");
        }
        if(next.done){
            leaveFullscreen();
            releaseCamera();
            cancelInterviewer();
            stopListening();
            setVoicePhase("");
            void loadReport();
        } else if(next.prompt && !/^problem statement/i.test(next.prompt)){
            beginSpeech(next.prompt);
            if (typeof next.preload === "string" && next.preload.trim() && !/^problem statement/i.test(next.preload)) {
                prepareInterviewerVoice(spokenLine(next.preload));
            }
        } else {
            setVoicePhase("");
        }
        } catch {
            setVoicePhase("");
            setError("The interviewer could not take that answer. Submit it again.");
        } finally {
            setPending("");
        }
    }
    async function loadReport(){
        if(!result){
            return;
        }
        setError("");
        setPending("report");
        try {
        const response=await api(
            apiUrl(`/api/v1/interviews/${result.id}/report`),
            {method: "POST"},
        );
        if(!response.ok){
            setError(`Report failed: ${response.status}`);
            return;
        }
        const next=await response.json();
        setReport(next);
        void loadInterviews();
        setResult({...result, status: next.status});
        } finally {
            setPending("");
        }
    }
    async function passTopic(){
        if(!result || !turn || turn.done || pendingRef.current === "hear" || pendingRef.current === "answer"){
            return;
        }
        stopListening();
        await finishRecording();
        const line="I don't remember right now. I'll work on it.";
        committedRef.current=line;
        setAnswer(line);
        void submitAnswer(undefined, line);
    }
    async function endInterview(){
        if(!result || result.status !== "live" || pendingRef.current === "hear" || pendingRef.current === "answer"){
            return;
        }
        leaveFullscreen();
        cancelInterviewer();
        stopListening();
        releaseCamera();
        setError("");
        setPending("end");
        try {
            const response=await api(apiUrl(`/api/v1/interviews/${result.id}/end`), { method: "POST" });
            if(!response.ok){
                setError(await response.text() || `End failed: ${response.status}`);
                return;
            }
            const next=await response.json() as { status: string };
            setTurn((current) => current ? { ...current, done: true } : current);
            setResult({ ...result, status: next.status });
            setVoicePhase("");
            await loadReport();
        } finally {
            setPending("");
        }
    }
    async function submitAuth(event: FormEvent){
        event.preventDefault();
        setError("");
        if (authMode === "signup" && !agreed) {
            setError("Confirm the privacy line before creating an account.");
            return;
        }
        setAuthPending(true);
        try {
            const response = await api(apiUrl(`/api/v1/auth/${authMode === "signup" ? "signup" : "login"}`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(authMode === "signup" ? { name: draftName, email, password } : { email, password }),
            });
            const detail = await response.json().catch(() => null) as (Account & { message?: string | string[] }) | null;
            if (!response.ok) {
                const message = Array.isArray(detail?.message) ? detail.message.join(" ") : detail?.message;
                setError(message || "That sign-in did not work.");
                return;
            }
            if (!detail) {
                return;
            }
            setAccount(detail);
            setUserName(detail.name);
            setPassword("");
        } finally {
            setAuthPending(false);
        }
    }
    async function submitProfile(event: FormEvent){
        event.preventDefault();
        setError("");
        setAuthPending(true);
        try {
            const response = await api(apiUrl("/api/v1/auth/profile"), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetRole: role, experienceLevel, goal }),
            });
            const detail = await response.json().catch(() => null) as (Account & { message?: string | string[] }) | null;
            if (!response.ok || !detail) {
                const message = Array.isArray(detail?.message) ? detail.message.join(" ") : detail?.message;
                setError(message || "Those answers were not saved.");
                return;
            }
            setAccount(detail);
            setRole(detail.targetRole);
            setExperienceLevel(detail.experienceLevel);
            setGoal(detail.goal);
        } finally {
            setAuthPending(false);
        }
    }
    async function signOut(){
        cancelInterviewer();
        releaseCamera();
        setVoicePhase("");
        await api(apiUrl("/api/v1/auth/logout"), { method: "POST" });
        setAccount(null);
        setPlace("lobby");
        setUserName("");
        setResult(null);
        setTurn(null);
        setInterviews([]);
        setSpeaker("");
    }
    if (!authReady || !account || !profileReady(account)) {
        return (
            <div className="gate">
                {!authReady ? (
                    <section className="gate-card">
                        <p className="mark">PracticeRoom</p>
                        <h1>PracticeRoom</h1>
                        <p className="lede">Checking your account.</p>
                    </section>
                ) : !account ? (
                    <form className="gate-card" onSubmit={submitAuth}>
                        <h1>PracticeRoom</h1>
                        <p className="lede">{authMode === "signup" ? "A practice interview starts here." : "Welcome back."}</p>
                        {error ? <p className="error">{error}</p> : null}
                        {authMode === "signup" ? (
                            <label>
                                Name
                                <input required autoFocus value={draftName} placeholder="Your name" onChange={(event) => setDraftName(event.target.value)} />
                            </label>
                        ) : null}
                        <label>
                            Email
                            <input required type="email" autoFocus={authMode === "login"} value={email} placeholder="Enter your email" onChange={(event) => setEmail(event.target.value)} />
                        </label>
                        <label>
                            Password
                            <input required type="password" minLength={8} value={password} placeholder="Enter your password" onChange={(event) => setPassword(event.target.value)} />
                        </label>
                        {authMode === "signup" ? (
                            <label className="agree">
                                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                                I agree to keep this practice private to my account.
                            </label>
                        ) : null}
                        <button className="continue" type="submit" disabled={authPending}>{authPending ? "Saving…" : "Continue"}</button>
                        <button className="switch" type="button" onClick={() => { setAuthMode(authMode === "signup" ? "login" : "signup"); setError(""); }}>
                            {authMode === "signup" ? "I already have an account" : "Create an account"}
                        </button>
                    </form>
                ) : (
                    <form className="gate-card" onSubmit={submitProfile}>
                        <h1>PracticeRoom</h1>
                        <p className="lede">Three questions, then your first interview.</p>
                        {error ? <p className="error">{error}</p> : null}
                        <label>
                            What role are you preparing for?
                            <input required value={role} onChange={(event) => setRole(event.target.value)} />
                        </label>
                        <label>
                            How much experience do you have?
                            <select value={experienceLevel} onChange={(event) => setExperienceLevel(event.target.value)}>
                                <option value="entry">Entry</option>
                                <option value="mid">Mid</option>
                                <option value="senior">Senior</option>
                            </select>
                        </label>
                        <label>
                            Primary goal
                            <select required value={goal} onChange={(event) => setGoal(event.target.value)}>
                                <option value="" disabled>Choose one</option>
                                <option value="this_week">Upcoming Interview This Week</option>
                                <option value="campus">Campus Placements</option>
                                <option value="practice">General Skill Practice</option>
                            </select>
                        </label>
                        <button className="continue" type="submit" disabled={authPending}>{authPending ? "Saving…" : "Continue"}</button>
                    </form>
                )}
                <aside className="gate-panel" aria-hidden="true">
                    <p className="gate-brand">PracticeRoom</p>
                    <div className="gate-metrics">
                        <p><span>Question</span>Tell me about a project you owned.</p>
                        <p><span>Your turn</span>Speak the answer. A pause sends it.</p>
                        <p><span>Scorecard</span>What you said, and how you said it.</p>
                    </div>
                </aside>
            </div>
        );
    }
    submitSpeechRef.current = (audio) => {
        if (pendingRef.current === "hear" || pendingRef.current === "answer") {
            return;
        }
        if (voicePhaseRef.current === "speaking" || voicePhaseRef.current === "preparing") {
            return;
        }
        void submitAnswer(wavFromSpeech(audio));
    };
    voicePhaseRef.current = voicePhase;
    pendingRef.current = pending;
    const interviewerSpeaking = speaker === "interviewer";
    const interviewerPreparing = voicePhase === "preparing";
    const spokenNow = turn && !turn.done ? spokenLine(turn.prompt) : "";
    const withVoice = voicePhase === "speaking" && audible ? audible : spokenNow;
    const clockLabel = (() => {
        if (!result?.startedAt || result.status !== "live") {
            return "";
        }
        const started = Date.parse(result.startedAt);
        const held = clockPause.current ?? readClock();
        const timePaused = held?.id === result.id ? held.pausedMs : pausedMs.current;
        const anchor = held?.id === result.id && held.leftAt ? held.leftAt : Math.max(clockNow, Date.now());
        const now = anchor - timePaused;
        const minutes = Number(result.durationMinutes);
        const budgetMs = Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 0;
        if (!budgetMs) {
            const elapsed = Math.max(0, now - started);
            return `${Math.floor(elapsed / 60000)}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}`;
        }
        const budgetEnd = started + budgetMs;
        const closing = turn?.sectionName === "Wrap-up";
        const end = closing && result.wrapUpUntil ? Date.parse(result.wrapUpUntil) + timePaused : budgetEnd;
        const remaining = end - now;
        const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
        const text = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
        if (minutes === 10 && closing && now > budgetEnd) {
            return remaining > 0 ? `Extra time for this answer: ${text}` : "Extra time for this answer.";
        }
        if (minutes === 10 && !closing && remaining <= 0) {
            return "Finish this answer. Then we'll wrap up.";
        }
        return `${text} left`;
    })();
    const visibleLines = interviewerPreparing
        ? lines.filter((line) => !(line.role === "interviewer" && line.text === spokenNow))
        : lines;
    if (place === "briefing" && result && (result.status === "ready" || result.status === "preparing" || result.status === "failed")) {
        return (
            <ReadyRoom
                title={result.title}
                interviewType={result.interviewType}
                sections={result.sections}
                company={result.company ?? ""}
                role={result.role ?? ""}
                skills={result.skills ?? []}
                context={result.context ?? ""}
                source={result.source ?? ""}
                persona={result.persona ?? ""}
                status={result.status}
                pending={pending === "start"}
                error={error}
                onEnter={() => { void startInterview(); }}
                onBack={backToLobby}
            />
        );
    }
    if (place === "lobby") {
        return (
            <Dashboard
                name={userName}
                spokenName={spokenName}
                onSpokenName={(value) => {
                    setSpokenName(value);
                    localStorage.setItem("practice-room-spoken-name", value);
                }}
                onSignOut={() => { void signOut(); }}
                rooms={interviews}
                error={error}
                view={studioView}
                onView={setStudioView}
                onOpen={(id) => {
                    const room = interviews.find((item) => item.id === id);
                    if (room?.status === "live") {
                        askFullscreen();
                    }
                    void openInterview(id);
                }}
                onDelete={(id) => { void deleteInterview(id); }}
                onRetake={(room) => {
                    setStudioView("overview");
                    setInterviewType(room.interviewType);
                    if (room.company) {
                        setMode("job");
                        setCompany(room.company);
                    }
                }}
                onPracticeTopic={(topic) => {
                    setStudioView("overview");
                    setMode("skill");
                    setSkills(topic.slice(0, 80));
                    setMaterials(topic);
                    setInterviewType("technical");
                }}
                launcher={{
                    interviewType,
                    onType: setInterviewType,
                    company,
                    onCompany: setCompany,
                    codingLanguage,
                    onCodingLanguage: setCodingLanguage,
                    role,
                    onRole: setRole,
                    mode,
                    onMode: setMode,
                    skills,
                    onSkills: setSkills,
                    description,
                    onDescription: setDescription,
                    materials,
                    onMaterials: setMaterials,
                    resumeName,
                    onResume: (file) => {
                        if (!file) {
                            setResume("");
                            setResumeName("");
                            return;
                        }
                        void readResumeFile(file).then((text) => {
                            if (!text) {
                                setResume("");
                                setResumeName("");
                                setError("Could not read that resume. Use a text file or a text-based PDF.");
                                return;
                            }
                            setError("");
                            setResume(text.slice(0, 4000));
                            setResumeName(file.name);
                        });
                    },
                    experienceLevel,
                    onExperience: setExperienceLevel,
                    persona,
                    onPersona: setPersona,
                    practiceMode,
                    onPractice: setPracticeMode,
                    difficulty,
                    onDifficulty: setDifficulty,
                    durationMinutes,
                    onMinutes: setDurationMinutes,
                    pending: pending === "create",
                    onPrepare: () => { void createInterview(); },
                    api,
                }}
            />
        );
    }
    if ((report || turn?.done) && result) {
        return (
            <ReportView
                title={result.title}
                startedAt={result.startedAt}
                report={report}
                pending={pending === "report"}
                error={error}
                onBack={backToLobby}
                onLoad={() => { void loadReport(); }}
            />
        );
    }
    async function runAndSubmit() {
        if (!result) {
            return;
        }
        const language = editorLanguage(result.title || "", result.codingLanguage);
        if (!canRun(language)) {
            setConsoleText("This runner executes JavaScript. The problem and your code stay on screen. Type a doubt and press Ask.");
            return;
        }
        setCodeRunning(true);
        setError("");
        try {
            const response = await api(apiUrl(`/api/v1/interviews/${result.id}/code`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
            });
            if (!response.ok) {
                setConsoleText(await response.text() || "The code could not run.");
                return;
            }
            const run = await response.json() as { output?: string; error?: string; elapsedMs?: number };
            const elapsed = run.elapsedMs ?? 0;
            setConsoleText(run.error ? `Error · ${elapsed} ms\n${run.error}` : `${elapsed} ms\n${run.output || "The code ran and printed nothing."}`);
        } catch {
            setConsoleText("The code could not run.");
            return;
        } finally {
            setCodeRunning(false);
        }
    }
    const liveMode = turn?.done
        ? "done"
        : interviewerPreparing
            ? "preparing"
            : interviewerSpeaking
                ? "speaking"
                : pending === "hear"
                    ? "refining"
                    : "listening";
    return (
        <LiveStage
            title={result?.title}
            interviewType={result?.interviewType ?? "technical"}
            sections={result?.sections ?? []}
            sectionName={turn?.sectionName || "Introduction"}
            prompt={turn && !turn.done ? (interviewerPreparing ? "Preparing the question." : withVoice) : turn?.done ? "That completes the interview." : "Take your seat. The interviewer speaks first."}
            hint={result?.practiceMode === "coach" && turn?.hint && !turn.done ? turn.hint : ""}
            starStatus={result?.interviewType === "behavioral" && result?.practiceMode === "coach" && !turn?.done ? turn?.starStatus : undefined}
            mode={liveMode}
            answer={answer}
            onAnswer={(value) => {
                committedRef.current = value;
                sessionTextRef.current = "";
                setAnswer(value);
            }}
            onEditStart={() => { editingRef.current = true; }}
            onEditEnd={() => {
                editingRef.current = false;
                committedRef.current = answer.trim();
            }}
            videoRef={videoRef}
            cameraReady={cameraReady}
            userName={userName}
            levels={micLevels}
            presence={presence}
            tabFocused={tabFocused}
            clock={clockLabel}
            coding={result?.interviewType === "coding" && !!turn && !turn.done && turn.sectionName !== "Introduction"}
            problem={problemText}
            code={code}
            onCode={setCode}
            consoleText={consoleText}
            running={codeRunning}
            onReset={() => { setCode(result?.interviewType === "coding" ? starterFor(editorLanguage(result.title || "", result.codingLanguage)) : ""); setConsoleText(""); }}
            language={editorLanguage(result?.title || "", result?.codingLanguage)}
            onRun={() => { void runAndSubmit(); }}
            pending={pending}
            error={error}
            earlier={visibleLines.filter((line) => line.text !== spokenNow)}
            done={Boolean(turn?.done)}
            report={null}
            onListen={() => listenForAnswer()}
            onSkip={() => { void passTopic(); }}
            onEnd={() => { void endInterview(); }}
            onFinish={() => {
                if (result?.interviewType === "coding") {
                    void submitAnswer(undefined, answer.trim());
                    return;
                }
                void submitAnswer();
            }}
            onLeave={backToLobby}
        />
    );
}