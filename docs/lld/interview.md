# PracticeRoom interview LLD

The interview engine has three layers. Each layer may call the layer beneath it. A lower layer does not import a higher one.

```text
interfaces        Nest controllers and HTTP
    |
application       one class per user action
    |
domain            interview rules and the session
    |
infrastructure    search clients and, later, the database
```

`SearchProvider` is a port. The domain and the application depend on that interface. `MockSearchProvider` is the infrastructure adapter behind it. A real web-search client later implements the same interface.

## Objects

| Object | Kind | Responsibility |
|---|---|---|
| `InterviewConfiguration` | Value | One shape for a job interview and a skill interview |
| `ResearchQuery`, `ResearchSource` | Value | Public search queries and the pages they return |
| `InterviewPlan`, `PlanSection`, `PlanQuestion` | Value | Timed sections and questions |
| `InterviewCursor`, `InterviewTurn` | Value | Current section and the question to speak |
| `TranscriptEntry` | Value | Prompt and the candidate's answer |
| `InterviewFeedback` | Value | Scores, quoted evidence, strengths, and practice topics |
| `InterviewSession` | Aggregate | Status, plan, cursor, and transcript |
| `SessionStateMachine` | Domain service | The only legal status changes |
| `SearchProvider` | Port | Search one query and return pages |

`InterviewSession` is the aggregate. Controllers and check scripts do not change `status`, `plan`, or `transcript` on their own. They call session methods, and those methods use the state machine.

## Status

```text
draft -> preparing -> ready -> live -> completed -> report_ready
```

`preparing`, `ready`, and `live` can move to `failed`. `report_ready` and `failed` accept no further events.

## Use cases

| Use case | Input | Output | Domain work |
|---|---|---|---|
| `PrepareInterview` | Configuration and a `SearchProvider` | Session in `ready` with a plan | Build queries, build the plan, then hand the plan to the session |
| `StartInterview` | Session in `ready` | First turn, status `live` | `session.start` |
| `AnswerInterview` | Session in `live` and an answer | Next turn or completion | `session.answer` |
| `ReportInterview` | Session in `completed` | `InterviewFeedback`, status `report_ready` | Score the transcript from its own words |

`PrepareInterview` owns the search call. `InterviewSession` does not import a search client. It receives a finished `InterviewPlan`. That keeps the internet outside the aggregate.

Job mode builds one query per public site, using `site:` and a bare domain, plus one company-site query. Skill mode builds no queries. Public pages are preparation sources. The job description remains the requirement.

`AnswerInterview` asks one follow-up when an answer is shorter than 40 characters. The next answer advances the section. The last section's answer completes the session.

`ReportInterview` quotes answers as evidence. A short answer lowers confidence. The report does not score accent, appearance, or personality.

## File layout

```text
apps/api/src/
├── domain/interview/
│   ├── session-state.ts
│   ├── configuration.ts
│   ├── research-query.ts
│   ├── plan.ts
│   ├── interviewer.ts
│   ├── feedback.ts
│   └── interview-session.ts
├── application/interview/
│   ├── prepare-interview.ts
│   ├── run-public-research.ts
│   └── report-interview.ts
├── infrastructure/search/
│   ├── search-provider.ts
│   └── mock-search-provider.ts
└── interfaces/http/
    ├── main.ts
    ├── app.module.ts
    └── health.controller.ts
```

Checks stay beside the file they exercise. Existing files still live in `src/interviews/` until each one is moved. Behavior stays the same during the move.

## Patterns in use

- **State.** `SessionStateMachine` is the only status writer.
- **Port and adapter.** `SearchProvider` and `MockSearchProvider`.
- **Builder.** `buildInterviewPlan` assembles sections, minutes, and questions.
- **Factory.** `InterviewSession.create` is the only constructor callers use.

New interview behavior is a domain rule plus an application use case. It is not a new Nest controller until the HTTP step.
