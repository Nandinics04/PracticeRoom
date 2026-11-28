import { KokoroTTS } from "kokoro-js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";
const PACE = 0.88;

type SpeakRequest = { id: number; parts: string[]; indexes?: number[]; priority?: boolean };
type CancelRequest = { cancel: number };
type SpeakResponse = {
    id: number;
    part?: number;
    samples?: Float32Array;
    rate?: number;
    done?: boolean;
    error?: string;
    engine?: "ready" | "failed";
};

let model: Promise<KokoroTTS> | null = null;
const dropped = new Set<number>();
const queue: SpeakRequest[] = [];
let busy = false;

function interviewerModel() {
    model ??= KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm" });
    return model;
}

function report(message: SpeakResponse, transfer: Transferable[] = []) {
    self.postMessage(message, { transfer });
}

void interviewerModel().then(() => {
    report({ id: -1, done: true, engine: "ready" });
}).catch((error: unknown) => {
    report({
        id: -1,
        done: true,
        engine: "failed",
        error: error instanceof Error ? error.message : "The interviewer voice failed",
    });
});

async function speak(request: SpeakRequest) {
    const tts = await interviewerModel();
    for (let part = 0; part < request.parts.length; part += 1) {
        if (dropped.has(request.id)) {
            return;
        }
        const audio = await tts.generate(request.parts[part], { voice: VOICE, speed: PACE });
        if (dropped.has(request.id)) {
            return;
        }
        const samples = new Float32Array(audio.audio);
        report({
            id: request.id,
            part: request.indexes?.[part] ?? part,
            samples,
            rate: audio.sampling_rate,
            done: part === request.parts.length - 1,
        }, [samples.buffer]);
    }
}

async function drain() {
    if (busy) {
        return;
    }
    busy = true;
    while (queue.length > 0) {
        const request = queue.shift();
        if (!request || dropped.has(request.id)) {
            continue;
        }
        try {
            await speak(request);
        } catch (error: unknown) {
            report({
                id: request.id,
                done: true,
                error: error instanceof Error ? error.message : "The interviewer voice failed",
            });
        }
    }
    busy = false;
}

self.onmessage = (event: MessageEvent<SpeakRequest | CancelRequest>) => {
    if ("cancel" in event.data) {
        dropped.add(event.data.cancel);
        return;
    }
    const request = event.data;
    if (request.priority) {
        queue.unshift(request);
    } else {
        queue.push(request);
    }
    void drain();
};
