import assert from "node:assert/strict";
import { applyMeasuredReport } from "./delivery-metrics.ts";

const report = applyMeasuredReport({
    overallScore: 80,
    criteria: [
        { name: "technical_accuracy", score: 80, evidence: "cache", explanation: "named", confidence: "high" },
        { name: "problem_solving", score: 70, evidence: "cache", explanation: "named", confidence: "high" },
        { name: "communication_clarity", score: 70, evidence: "cache", explanation: "named", confidence: "high" },
        { name: "answer_relevance", score: 70, evidence: "cache", explanation: "named", confidence: "high" },
        { name: "completeness", score: 60, evidence: "cache", explanation: "named", confidence: "high" },
    ],
    strengths: [],
    improvements: [],
    practiceTopics: [],
    content: [{ name: "Ownership", score: 70, detail: "I chose the cache.", needsWork: false }],
    questions: [{ prompt: "Tell me about the project.", score: 4, note: "", worked: "You named the cache.", missing: "The result is missing." }],
}, [
    {
        sectionName: "Introduction",
        prompt: "Tell me about the project.",
        answer: "I chose the cache so my service stayed fast.",
        action: "advance",
        delivery: { fillers: 1, words: 8, elapsedMs: 70000, latencyMs: 2000, tabHidden: 0, tabAwayMs: 0, faces: 1 },
    },
]);

assert.equal(report.questions?.[0]?.action, "advance");
assert.equal(report.turns?.[0]?.thinkSeconds, 2);
assert.ok((report.delivery ?? []).some((row) => row.name === "Speaking pace"));
assert.equal(report.pillars?.length, 4);
assert.ok((report.overallScore ?? 0) > 0 && (report.overallScore ?? 0) <= 100);
console.log("delivery metrics ok");
