# PracticeRoom high-level design

PracticeRoom is a pnpm workspace. The running code is a NestJS API plus a shared TypeScript package. The interview rules run in the API process. They are not a separate Python service yet.

```text
packages/shared-types     InterviewConfiguration, plan, research, and feedback types
        |
apps/api                  NestJS process
  interfaces              GET /api/v1/health
  interview engine        session, research, plan, turns, feedback
  SearchProvider          MockSearchProvider returns example pages
```

`apps/web` and `apps/ai-service` are reserved folders. They have no application code. PostgreSQL, Redis, S3, and Kubernetes are not wired up.

## What happens in one session

```text
JobInterviewInput or SkillInterviewInput
        |
        v
toInterviewConfiguration
        |
        v
InterviewSession.create          status: draft
        |
        v
session.prepare(SearchProvider)  status: preparing, then ready
        |                        job mode: queries and example pages
        |                        skill mode: no queries
        v
buildInterviewPlan               sections sum to durationMinutes
        |
        v
session.start                    status: live, first transcript row
        |
        v
session.answer                   follow-up or next section
        |
        v
last answer                      status: completed
        |
        v
session.report                   status: report_ready
                                 InterviewFeedback
```

The session is the only object that changes interview status. It does that through `SessionStateMachine`. A check script or a future controller calls `create`, `prepare`, `start`, `answer`, and `report`. It does not assign `status` itself.

## Components that exist

| Component | Where | Role |
|---|---|---|
| Shared types | `packages/shared-types` | Types imported by the API. No runtime behavior. |
| HTTP interface | `apps/api/src/main.ts`, `health.controller.ts` | Prefix `api/v1`. Health returns `ok` and the experience levels. |
| Configuration | `interviews/configuration.ts` | Maps both forms onto `InterviewConfiguration`. |
| Research | `interviews/research.ts`, `research-service.ts` | Builds site queries and collects pages. |
| Search port | `interviews/search-provider.ts` | `SearchProvider` and `MockSearchProvider`. |
| Plan | `interviews/plan.ts` | Sections, minutes, one question each. |
| Interviewer | `interviews/interviewer.ts` | First question, follow-up, and next section. |
| Session | `interviews/interview-session.ts` | Aggregate: status, plan, cursor, transcript. |
| Feedback | `interviews/feedback.ts` | Scores the transcript and quotes an answer. |
| State machine | `interviews/session-state.ts` | Legal status transitions. |

## Target shape, not moved yet

The low-level design separates domain rules, application use cases, and infrastructure. The files above still share `apps/api/src/interviews/`. `InterviewSession.prepare` still calls research and plan building directly. The next structural change extracts that coordination into a `PrepareInterview` use case so the session receives a finished plan and does not import the search client.

A later FastAPI service can own model calls and web search behind the same `SearchProvider` port. The Nest API keeps identity, session lifecycle, and reports.

## Runtime

Local checks execute TypeScript with `node --experimental-strip-types`. Nest compiles the API separately with `nest start` and serves port 3000. The engine does not need the server to be running. The health route does.

Node prints a module-type warning for the check scripts. The API package stays CommonJS because that is what Nest emits. `"type": "module"` is not set.
