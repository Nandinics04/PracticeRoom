type SpeakResponse = {
    id: number;
    part?: number;
    samples?: Float32Array;
    rate?: number;
    done?: boolean;
    error?: string;
    engine?: "ready" | "failed";
};

export type VoiceEngine = "loading" | "ready" | "failed";

let engineStatus: VoiceEngine = "loading";
const engineWaiters = new Set<(status: VoiceEngine) => void>();

type SentenceAudio = { buffer: AudioBuffer | null; done: boolean };
type Clip = {
    text: string;
    id: number;
    sentences: string[];
    parts: SentenceAudio[];
    waiters: Array<() => void>;
};

const worker = new Worker(new URL("./interviewer-voice.worker.ts", import.meta.url), { type: "module" });
const audioContext = new AudioContext();
const clips = new Map<number, Clip>();
const byText = new Map<string, Clip>();
const sentenceAudio = new Map<string, AudioBuffer>();

function rememberSentence(text: string, buffer: AudioBuffer) {
    sentenceAudio.delete(text);
    sentenceAudio.set(text, buffer);
    while (sentenceAudio.size > 24) {
        const oldest = sentenceAudio.keys().next().value;
        if (!oldest) {
            break;
        }
        sentenceAudio.delete(oldest);
    }
}

let run = 0;
let requestId = 0;
let speakingId = 0;
let stopPlayback: (() => void) | null = null;

function wake(clip: Clip) {
    const waiting = clip.waiters.splice(0);
    waiting.forEach((resume) => resume());
}

function sentencesOf(text: string) {
    const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
    const spoken = parts.length > 0 ? parts : [text.trim()];
    return spoken.filter(Boolean).slice(0, 2);
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
        if (message.samples == null) {
            return;
        }
    }
    const clip = clips.get(message.id);
    if (!clip) {
        return;
    }
    const index = message.part ?? 0;
    const part = clip.parts[index];
    if (part && message.samples && message.rate && message.samples.length > 0 && !part.buffer) {
        const buffer = audioContext.createBuffer(1, message.samples.length, message.rate);
        buffer.getChannelData(0).set(message.samples);
        part.buffer = buffer;
        const sentence = clip.sentences[index];
        if (sentence) {
            rememberSentence(sentence, buffer);
        }
    }
    if (part && (message.done || message.error || part.buffer)) {
        part.done = Boolean(message.done || message.error || part.buffer);
    }
    if (message.done || message.error) {
        for (const sentence of clip.parts) {
            sentence.done = true;
        }
    }
    wake(clip);
});

export function unlockInterviewerVoice() {
    void audioContext.resume();
}

window.addEventListener("pointerdown", () => {
    unlockInterviewerVoice();
});

function enqueue(text: string, priority = false) {
    const trimmed = text.trim();
    const cached = byText.get(trimmed);
    if (cached) {
        return cached;
    }
    const sentences = sentencesOf(trimmed);
    const id = ++requestId;
    const needed: { sentence: string; index: number }[] = [];
    const clip: Clip = {
        text: trimmed,
        id,
        sentences,
        parts: sentences.map((sentence, index) => {
            const cached = sentenceAudio.get(sentence);
            if (cached) {
                return { buffer: cached, done: true };
            }
            needed.push({ sentence, index });
            return { buffer: null, done: false };
        }),
        waiters: [],
    };
    clips.set(id, clip);
    byText.set(trimmed, clip);
    while (byText.size > 6) {
        const oldest = byText.keys().next().value;
        if (!oldest) {
            break;
        }
        const stale = byText.get(oldest);
        if (stale?.id === speakingId) {
            break;
        }
        byText.delete(oldest);
        if (stale) {
            clips.delete(stale.id);
        }
    }
    if (needed.length > 0) {
        worker.postMessage({
            id,
            parts: needed.map((item) => item.sentence),
            indexes: needed.map((item) => item.index),
            priority,
        });
    }
    return clip;
}

export function prepareInterviewerVoice(text: string) {
    const trimmed = text.trim();
    if (!trimmed || /^problem statement/i.test(trimmed)) {
        return;
    }
    enqueue(trimmed);
}

export function cancelInterviewer() {
    run += 1;
    stopPlayback?.();
    stopPlayback = null;
}

export function speakAsInterviewer(text: string, onPhase: (phase: "preparing" | "speaking", audible?: string) => void) {
    cancelInterviewer();
    const trimmed = text.trim();
    if (speakingId && speakingId !== byText.get(trimmed)?.id) {
        worker.postMessage({ cancel: speakingId });
        const previous = clips.get(speakingId);
        if (previous && byText.get(previous.text)?.id === speakingId && previous.parts.some((part) => !part.buffer)) {
            byText.delete(previous.text);
            clips.delete(previous.id);
        }
    }
    const token = run;
    const clip = enqueue(trimmed, true);
    let started = false;
    speakingId = clip.id;
    void audioContext.resume();
    return new Promise<void>((resolve) => {
        let settled = false;
        let scheduled = 0;
        let cursor = 0;
        const sources: AudioBufferSourceNode[] = [];
        const reveals: number[] = [];

        const finish = () => {
            if (settled) {
                return;
            }
            settled = true;
            resolve();
        };

        const pump = () => {
            if (token !== run || settled) {
                return;
            }
            while (scheduled < clip.parts.length) {
                const part = clip.parts[scheduled];
                if (!part.buffer) {
                    if (part.done) {
                        scheduled += 1;
                        continue;
                    }
                    if (!started) {
                        onPhase("preparing");
                    }
                    clip.waiters.push(pump);
                    stopPlayback = () => finish();
                    return;
                }
                started = true;
                const when = Math.max(cursor, audioContext.currentTime + 0.02);
                const heard = (clip.sentences ?? [clip.text]).slice(0, scheduled + 1).join(" ");
                const delay = Math.max(0, (when - audioContext.currentTime) * 1000);
                reveals.push(window.setTimeout(() => {
                    if (token !== run || settled) {
                        return;
                    }
                    onPhase("speaking", heard);
                }, delay));
                const source = audioContext.createBufferSource();
                source.buffer = part.buffer;
                const gain = audioContext.createGain();
                gain.gain.value = 0.85;
                source.connect(gain);
                gain.connect(audioContext.destination);
                const last = scheduled === clip.parts.length - 1;
                source.onended = () => {
                    if (last) {
                        finish();
                    }
                };
                sources.push(source);
                source.start(when);
                cursor = when + part.buffer.duration;
                scheduled += 1;
            }
            if (scheduled >= clip.parts.length && sources.length === 0) {
                finish();
            }
            stopPlayback = () => {
                for (const reveal of reveals) {
                    window.clearTimeout(reveal);
                }
                for (const playing of sources) {
                    playing.onended = null;
                    try {
                        playing.stop();
                    } catch {
                        // This sentence already finished.
                    }
                }
                finish();
            };
        };

        pump();
    });
}
