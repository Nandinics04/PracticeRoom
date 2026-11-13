# ADR 003: Score feedback from quoted answers

## Status

Accepted for the first report.

## Decision

`buildFeedback` scores five criteria from the transcript. Evidence is a substring of an answer, not a paraphrase. Mostly-short transcripts score 40 with confidence `low`. Otherwise the score is 80 with confidence `high`. The short-answer limit is 40 characters, the same limit the interviewer uses for a follow-up.

The report does not score accent, appearance, emotion, or personality.

## Why

A score without a quote cannot be checked. Reusing the 40-character rule keeps the interviewer and the report consistent until a model replaces both tests. The `InterviewFeedback` shape can stay when that model arrives: criterion name, score, evidence, explanation, and confidence.

## Consequence

The numbers 40 and 80 are rule outputs, not a human grader. A blank or whitespace answer is ignored. If every answer is blank, `buildFeedback` throws and `report` does not move the session to `report_ready`.
