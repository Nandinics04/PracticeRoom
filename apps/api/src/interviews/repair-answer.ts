import { callRoom } from "./python-room";

export function repairSpokenAnswer(body: {
    answer: string;
    question?: string;
    resume?: string;
    company?: string;
    role?: string;
    jobDescription?: string;
}): Promise<string> {
    const original = body.answer.trim();
    if (original.split(/\s+/).length < 8) {
        return Promise.resolve(original);
    }
    return callRoom<{ answer?: string }>("repair", body, 5000).then(
        (parsed) => parsed.answer?.trim() || original,
        () => original,
    );
}
