type SpeakResponse = {
    id: number;
    samples?: Float32Array;
    rate?: number;
    done?: boolean;
    error?: string;
    engine?: "ready" | "failed";
};

export type VoiceEngine = "loading" | "ready" | "failed";

let engineStatus: VoiceEngine = "loading";
const engineWaiters = new Set<(status: VoiceEngine) => void>();

type PreparedVoice = {
    text: string;
    id: number;
    buffer: AudioBuffer | null;
    done: boolean;
    waiting: Array<() => void>;
};

const worker = new Worker(new URL("./interviewer-voice.worker.ts", import.meta.url), { type: "module" });
const audioContext = new AudioContext();

let run = 0;
let requestId = 0;
let prepared: PreparedVoice | null = null;
let stopPlayback: (() => void) | null = null;

function wake(voice: PreparedVoice) {
    const waiting = voice.waiting.splice(0);
    waiting.forEach((resume) => resume());
}

export function watchVoiceEngine(onStatus: (status: VoiceEngine) => void) {
    onStatus(engineStatus);
    engineWaiters.add(onStatus);
    return () => {
        engineWaiters.delete(onStatus);
    };
}

worker.addEventListener("message", (event: MessageEvent<SpeakResponse>) => {
    const message = event.data;
    if (message.engine) {
        engineStatus = message.engine;
        for (const waiter of engineWaiters) {
            waiter(engineStatus);
        }
        if (!message.samples) {
            return;
        }
    }
    const voice = prepared;
    if (!voice || message.id !== voice.id) {
        return;
    }
    if (message.samples && message.rate && message.samples.length > 0 && !voice.buffer) {
        const buffer = audioContext.createBuffer(1, message.samples.length, message.rate);
        buffer.getChannelData(0).set(message.samples);
        voice.buffer = buffer;
    }
    if (message.done || message.error) {
        voice.done = true;
    }
    wake(voice);
});

export function unlockInterviewerVoice() {
    void audioContext.resume();
}

window.addEventListener("pointerdown", () => {
    unlockInterviewerVoice();
});

export function prepareInterviewerVoice(text: string) {
    const trimmed = text.trim();
    if (!trimmed || prepared?.text === trimmed) {
        return;
    }
    const id = ++requestId;
    worker.postMessage({ cancel: id });
    prepared = { text: trimmed, id, buffer: null, done: false, waiting: [] };
    worker.postMessage({ id, text: trimmed });
}

export function cancelInterviewer() {
    run += 1;
    stopPlayback?.();
    stopPlayback = null;
}

export function speakAsInterviewer(text: string, onPhase: (phase: "preparing" | "speaking") => void) {
    cancelInterviewer();
    const token = run;
    prepareInterviewerVoice(text);
    void audioContext.resume();
    const trimmed = text.trim();
    return new Promise<void>((resolve) => {
        let settled = false;
        const sources: AudioBufferSourceNode[] = [];

        const finish = () => {
            if (settled) {
                return;
            }
            settled = true;
            resolve();
        };

        const play = () => {
            if (token !== run || settled) {
                return;
            }
            const voice = prepared;
            if (!voice || voice.text !== trimmed) {
                finish();
                return;
            }
            if (!voice.buffer || !voice.done) {
                if (voice.done && !voice.buffer) {
                    finish();
                    return;
                }
                onPhase("preparing");
                voice.waiting.push(play);
                stopPlayback = () => finish();
                return;
            }
            onPhase("speaking");
            const source = audioContext.createBufferSource();
            source.buffer = voice.buffer;
            const gain = audioContext.createGain();
            gain.gain.value = 0.85;
            source.connect(gain);
            gain.connect(audioContext.destination);
            source.onended = () => finish();
            sources.push(source);
            source.start(audioContext.currentTime + 0.03);
            stopPlayback = () => {
                for (const playing of sources) {
                    playing.onended = null;
                    try {
                        playing.stop();
                    } catch {
                        // This line already finished.
                    }
                }
                finish();
            };
        };

        play();
    });
}
