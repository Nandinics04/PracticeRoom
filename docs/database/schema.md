# PracticeRoom data

No database is connected. A session lives on the `InterviewSession` object and disappears when the process ends. This document records that in-memory shape, then the tables to add when persistence starts. Do not treat the tables as created.

## In memory today

`InterviewSession` holds:

| Field | Type | Who writes it |
|---|---|---|
| `status` | `InterviewStatus` | `SessionStateMachine` through `ready`, `start`, `applyAnswer`, and `markReportReady` |
| `plan` | `InterviewPlan` or `null` | `ready` |
| `transcript` | `TranscriptEntry[]` | `start` and `applyAnswer` |
| `cursor` | `InterviewCursor` | `applyAnswer` |
| `config` | `InterviewConfiguration` | `create`, private |

`TranscriptEntry` is `sectionName`, `prompt`, and `answer`. A new question is pushed with `answer: ""`. The candidate's text replaces that empty string. The final "That completes the interview." turn is not a transcript row.

`InterviewPlan` stores `title`, `totalMinutes`, `sections`, and `sourceUrls`. Each section stores `name`, `minutes`, and one `PlanQuestion` with `prompt`, `rubric`, and up to two source URLs.

`InterviewFeedback` is computed by `reportInterview` and returned to the caller. The session does not keep the report on a field. After `markReportReady`, only `status` shows that the report was produced (`report_ready`).

`SessionStore` holds those session objects in a `Map` for the life of the API process. The current create route stores one session under the id `123`.

Research pages are not stored separately. Their URLs are copied onto the plan. `MockSearchProvider` does not download page bodies.

## Planned tables

Add these when a session must survive a restart. PostgreSQL is the intended database. Large audio and video do not belong in these tables.

| Table | Stores |
|---|---|
| `users` | Account email and password hash, later |
| `interview_configurations` | Mode, type, level, difficulty, duration, skills, focus areas |
| `job_contexts` | Company, role, description, optional URL, optional round |
| `research_sources` | Platform, title, URL, excerpt, tied to one configuration |
| `interview_plans` | Title, total minutes, source URL list |
| `interview_sections` | Name, minutes, order |
| `interview_questions` | Prompt, rubric, source URLs |
| `interview_sessions` | Status, current section index, follow-up flag, timestamps |
| `interview_answers` | Section, prompt, answer text |
| `evaluations` | Overall score |
| `evaluation_criteria` | Criterion name, score, evidence quote, explanation, confidence |
| `improvement_items` | Strengths, improvements, and practice topics |

Status values in `interview_sessions` are the same seven strings the state machine allows. Updating that column still has to go through the same transitions. A repository may save the new status. It may not invent a new one.

Until these tables exist, the check scripts are the persistence of the rules: they rebuild a session, run it, and discard it.
