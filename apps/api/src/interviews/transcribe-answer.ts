import { callRoom } from "./python-room";

export function transcribeAnswer(body: { audio: string; mime?: string; hint?: string; question?: string; resume?: string; skills?: string }): Promise<{ text: string; error: string }> {
    const empty = { text: "", error: "Whisper could not transcribe the recording." };
    return callRoom<{ text?: string; error?: string }>("transcribe", body, 7000).then(
        (parsed) => ({ text: parsed.text?.trim() || "", error: parsed.error?.trim() || "" }),
        () => empty,
    );
}
