# PracticeRoom high-level design

PracticeRoom is a pnpm workspace. The running code is a React page and a NestJS API, plus a shared TypeScript package. The interview rules run in the API process. They are not a separate Python service yet.

```text
apps/web                  React page on port 5173
        |  HTTP, CORS origin http://localhost:5173
        v
apps/api                  NestJS process on port 3000
  GET  /api/v1/health
  POST /api/v1/interviews
  POST /api/v1/interviews/:id/start
  POST /api/v1/interviews/:id/answer
  POST /api/v1/interviews/:id/report
        |
        v
application use cases     prepareInterview, answerInterview, reportInterview
        |
        v
InterviewSession          status, plan, cursor, transcript
SearchProvider            MockSearchProvider returns example pages
AnswerEvaluator           MockAnswerEvaluator calls nextTurn
ReportGenerator           MockReportGenerator calls buildFeedback
```

`apps/ai-service` is a reserved folder. PostgreSQL, Redis, S3, and Kubernetes are not wired up. The browser speaks and listens. Audio and camera video stay on the page.

## What happens in one session

```text
JobInterviewInput or SkillInterviewInput
        |
        v
toInterviewConfiguration
        |
        v
prepareInterview(SearchProvider)
  InterviewSession.create          status: draft
  runPublicResearch                job mode: example pages
                                   skill mode: no queries
  buildInterviewPlan
  session.ready(plan)              status: preparing, then ready
        |
        v
session.start                      status: live, first transcript row
        |
        v
answerInterview(AnswerEvaluator)
  nextTurn decides the follow-up
  session.applyAnswer              stays live, or status: completed
        |
        v
reportInterview(ReportGenerator)
  buildFeedback scores the transcript
  session.markReportReady          status: report_ready
```

The session is the only object that changes interview status. It does that through `SessionStateMachine`. The controller and the use cases do not assign `status` themselves.

## Components that exist

| Component | Where | Role |
|---|---|---|
| Web page | `apps/web/src/App.tsx` | Form, plan list, camera preview, spoken question, answer, code editor, report |
| Shared types | `packages/shared-types` | Types imported by the API. No runtime behavior. |
| HTTP interface | `apps/api/src/main.ts`, controllers | Prefix `api/v1`. CORS for port 5173. |
| Prepare | `application/interview/prepare-interview.ts` | Search, plan, then `ready` |
| Answer | `application/interview/answer-interview.ts` | Evaluator, then `applyAnswer` |
| Report | `application/interview/report-interview.ts` | Generator, then `markReportReady` |
| Configuration | `interviews/configuration.ts` | Maps both forms onto `InterviewConfiguration` |
| Research | `interviews/research.ts`, `research-service.ts` | Builds site queries and collects pages |
| Search port | `interviews/search-provider.ts` | `SearchProvider` and `MockSearchProvider` |
| Plan | `interviews/plan.ts`, `interview-strategy.ts` | Sections, minutes, follow-up text |
| Interviewer | `interviews/interviewer.ts` | First question and the 40-character follow-up rule |
| Session | `interviews/interview-session.ts` | Aggregate: status, plan, cursor, transcript |
| Feedback | `interviews/feedback.ts` | Scores the transcript and quotes an answer |
| Store | `interviews/session-store.ts` | In-memory map. Unknown id is a 404 |
| State machine | `interviews/session-state.ts` | Legal status transitions |

## Target shape

A later FastAPI service can own model calls and web search behind `SearchProvider`, `AnswerEvaluator`, and `ReportGenerator`. The Nest API keeps the session lifecycle. The mocks stay until that service exists.

Screen capture is a function in the web module and is not on the page. It waits until a recording can be stored. The camera preview is not a recording.

## Runtime

`pnpm --filter @practice-room/api start` serves port 3000. `pnpm --filter @practice-room/web dev` serves port 5173. The session check runs with `pnpm dlx tsx` because the API sources use extensionless imports. The API package stays CommonJS because that is what Nest emits. `"type": "module"` is not set on `apps/api`.
