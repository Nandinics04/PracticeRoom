import { KokoroTTS } from "kokoro-js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";
const PACE = 0.88;

type SpeakRequest = { id: number; text: string };
type CancelRequest = { cancel: number };
type SpeakResponse = {
    id: number;
    samples?: Float32Array;
    rate?: number;
    done?: boolean;
    error?: string;
    engine?: "ready" | "failed";
};

let model: Promise<KokoroTTS> | null = null;
let chain: Promise<void> = Promise.resolve();
let current = 0;

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
    if (current !== request.id) {
        return;
    }
    const audio = await tts.generate(request.text, { voice: VOICE, speed: PACE });
    if (current !== request.id) {
        return;
    }
    const samples = new Float32Array(audio.audio);
    report({ id: request.id, samples, rate: audio.sampling_rate, done: true }, [samples.buffer]);
}

self.onmessage = (event: MessageEvent<SpeakRequest | CancelRequest>) => {
    if ("cancel" in event.data) {
        current = 0;
        return;
    }
    const request = event.data;
    current = request.id;
    chain = chain.then(() => speak(request)).catch((error: unknown) => {
        report({
            id: request.id,
            done: true,
            error: error instanceof Error ? error.message : "The interviewer voice failed",
        });
    });
};
