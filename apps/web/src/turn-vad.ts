import { MicVAD } from "@ricky0123/vad-web";

export function wavFromSpeech(samples: Float32Array, sampleRate = 16000) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const write = (offset: number, text: string) => {
        for (let index = 0; index < text.length; index += 1) {
            view.setUint8(offset + index, text.charCodeAt(index));
        }
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, samples[index]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
    }
    return new Blob([buffer], { type: "audio/wav" });
}

export type TurnEar = {
    start: () => Promise<void>;
    pause: () => Promise<void>;
    destroy: () => Promise<void>;
};

export async function openTurnEar(handlers: {
    onSpeechStart: () => void;
    onSpeechEnd: (audio: Float32Array) => void;
}): Promise<TurnEar> {
    const vad = await MicVAD.new({
        model: "v5",
        startOnLoad: false,
        redemptionMs: 1400,
        minSpeechMs: 700,
        preSpeechPadMs: 400,
        submitUserSpeechOnPause: false,
        baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/",
        onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/",
        onSpeechStart: handlers.onSpeechStart,
        onSpeechEnd: handlers.onSpeechEnd,
    });
    return {
        start: () => vad.start(),
        pause: () => vad.pause(),
        destroy: () => vad.destroy(),
    };
}
