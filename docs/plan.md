# PracticeRoom plan

PracticeRoom is a mock-interview product. A candidate describes a job or a set of skills. The system prepares a timed interview, asks one question at a time, and returns a feedback report that quotes the candidate's own answers.

The product name in the interface is PracticeRoom. The npm packages are `practice-room`, `@practice-room/web`, `@practice-room/api`, and `@practice-room/shared-types`. The folder on disk stays `HirePro`.

This file is the build plan. The detailed rules stay in the other docs: [requirements](requirements/prd.md), [high-level design](architecture/hld.md), [interview design](lld/interview.md), [HTTP](api/http.md), and [data](database/schema.md).

## Product rules that do not change

- A session starts as a job interview or a skill interview. Both forms become one `InterviewConfiguration`.
- Experience levels are `entry`, `mid`, and `senior`. Interview types are `technical`, `coding`, `behavioral`, `system_design`, `hr`, and `mixed`.
- Job mode builds public search queries. Skill mode skips search. Those pages are preparation material. They are not the company's confidential questions.
- One short answer, under 40 characters, gets one follow-up in the same section. The next answer moves to the next section.
- The report scores five criteria: technical accuracy, problem solving, communication clarity, answer relevance, and completeness. Evidence is a quote from the transcript. The report does not score accent, appearance, emotion, or personality.
- The camera preview is local setup. It is not uploaded and it is not scored. Screen sharing stays off the page until a recording can be stored.
- Speech uses the browser: `speechSynthesis` speaks the question, and `SpeechRecognition` or `webkitSpeechRecognition` fills the answer box. The candidate submits the text after checking it.
- The code editor appears only for a coding interview. Its text is sent with the spoken or typed answer, then cleared.

## Design patterns

Every new piece extends the pattern that already owns that job. A controller or a use case depends on a port. The Nest module chooses the adapter.

| Pattern | What it owns | Where it lives |
|---|---|---|
| State | The only writer of interview status | `SessionStateMachine.transition` |
| Factory | Building a session | `InterviewSession.create`, `InterviewSession.fromRecord` |
| Builder | Assembling the timed plan | `buildInterviewPlan` |
| Strategy | Section names and the follow-up sentence | `InterviewStrategy` and one class per interview type |
| Port and adapter | Search, answer evaluation, report generation, and session storage | `SearchProvider`, `AnswerEvaluator`, `ReportGenerator`, `SessionRepository` |
| Repository | Saving and loading sessions | `SessionStore` in memory, `FileSessionStore` on disk |
| Use case | Coordinating a port and then telling the session to apply the result | `prepareInterview`, `answerInterview`, `reportInterview` |

Loading a saved record may assign the stored status. That load is not a new state-machine event. A repository may save the status the machine already produced. It may not invent a new one.

```text
draft --prepare--> preparing --plan_ready--> ready --start--> live --end--> completed --report_ready--> report_ready
```

`preparing`, `ready`, and `live` can also move to `failed`. `report_ready` and `failed` have no further moves.

## What is running today

The first build is one working path, not accounts, PostgreSQL, or Kubernetes.

```text
apps/web          React page, port 5173
       |  HTTP, CORS origin http://localhost:5173
       v
apps/api          NestJS, port 3000, prefix api/v1
       |
       v
use cases         prepareInterview, answerInterview, reportInterview
       |
       v
InterviewSession  status, plan, cursor, transcript, feedback
ports             MockSearchProvider, MockAnswerEvaluator, MockReportGenerator
```

`apps/ai-service` is a reserved FastAPI folder. It is not part of the pnpm workspace and it has no running service.

The page can create either mode, show the plan and the preparation links, require a camera preview, speak each question, accept a spoken or typed answer, show the editor for coding interviews, load the report, list interviews in the current process, and restore the last id from `sessionStorage`.

Routes:

| Method | Path | Role |
|---|---|---|
| GET | `/api/v1/health` | Status and the experience levels |
| POST | `/api/v1/interviews` | Prepare a session and return the plan |
| GET | `/api/v1/interviews` | List sessions in the current store |
| GET | `/api/v1/interviews/:id` | One session, including feedback when it exists |
| POST | `/api/v1/interviews/:id/start` | First question |
| POST | `/api/v1/interviews/:id/answer` | One confirmed answer |
| POST | `/api/v1/interviews/:id/report` | Score a completed interview |

Create ids come from `randomUUID()`. Search still returns `https://example.com/...` links. Scoring is still the 40-character stand-in: mostly short answers score 40 with low confidence, otherwise 80 with high confidence.

The API package stays CommonJS. Do not add `"type": "module"` to `apps/api/package.json`. Checks that import Nest sources run with `pnpm dlx tsx`. The other checks run with `node --experimental-strip-types`.

## Phase 1. File repository

This phase is in progress. Its job is to keep a session after the API process stops, without introducing PostgreSQL yet.

Done:

- `SessionRepository` is the port: `save`, `get`, and `list`.
- `SessionStore` is the in-memory adapter.
- `InterviewSession.toRecord` and `InterviewSession.fromRecord` copy the data a store can write. `config` is private, so the record carries it.
- `FileSessionStore` writes `SessionRecord` values to a JSON file and loads them in its constructor.
- `file session store ok` proves a second store, reading the same file, still has the interview.

Still to wire:

1. Add `SESSION_REPOSITORY` as the injection token on the port.
2. Inject `SessionRepository` into `InterviewsController`. The controller does not name `FileSessionStore`.
3. In `AppModule`, bind that token with `useClass: FileSessionStore`.
4. Call `store.save` after start, after each answer, and after the report. Create already saves. The file is written only inside `save`.
5. Import `join` next to `dirname` in `file-session-store.ts`. The default path is `data/sessions.json` under the API process directory.
6. Ignore `apps/api/data` in the root `.gitignore`.
7. Restart the API, create an interview, restart again, and confirm the list still contains it.

`SessionStore` stays in the project. Its check still covers the in-memory adapter.

## Phase 2. PostgreSQL repository

Replace the JSON file with a third adapter that implements `SessionRepository`. The Nest module changes the binding. The controller stays on the port.

The tables are already listed in [docs/database/schema.md](database/schema.md): configuration, job context, research sources, plan, sections, questions, session, answers, evaluation, criteria, and improvement items. Status values in `interview_sessions` are the same seven strings the state machine allows.

Large audio and video do not go in these tables. Accounts are a later column set on `users`, not part of the first migration.

The first database check is the same story as the file check: save a session, construct a new repository, and read the status, interview type, transcript, and feedback back.

## Phase 3. Accounts

Add email and password sign-in. A session belongs to the user who created it. List and get return only that user's interviews. The state machine and the interview use cases stay the same.

This phase needs the `users` table from Phase 2 and a JWT or session cookie on the API. The page gains sign-in and sign-out. The camera, speech, and report flow stay behind that gate.

## Phase 4. Real preparation search

Replace `MockSearchProvider` with an adapter that runs the queries `buildResearchQueries` already builds. A failed site is skipped. A URL already seen is skipped. Skill mode still sends no queries.

The Nest use case keeps calling `SearchProvider`. The new adapter can live in the Nest process first. Moving the call to `apps/ai-service` is allowed later, as long as the port shape stays `search(query) -> ResearchSource[]`.

The page already shows `sourceUrls`. When real pages arrive, those links open the preparation material.

## Phase 5. Model evaluation and reports

Replace `MockAnswerEvaluator` and `MockReportGenerator` with adapters that call a model. The session still does not import `nextTurn` or `buildFeedback`.

- The answer adapter returns the next turn. The 40-character rule can stay as the fallback when no model is configured.
- The report adapter returns `InterviewFeedback`: five criteria, a quote, an explanation, a confidence, strengths, improvements, and practice topics.
- The report still must not score accent, appearance, emotion, or personality.

`apps/ai-service` is the reserved home for those model calls. Until it exists, the mocks stay.

## Phase 6. Recordings

Store camera and screen recordings outside the interview tables. The page already has `shareScreen` and stops the camera when the interview finishes. The button and the screen video stay hidden until an object store can accept the file.

Playback, if added, belongs on the finished interview. It is not an input to the score.

## Phase 7. Deployment

Run the web app, the Nest API, PostgreSQL, and the model service as separate deployable units. Kubernetes, Redis, and a queue are allowed here. They are not required to prove the interview rules.

## Order of work

1. Finish the file repository wiring in Phase 1 and prove a restart keeps the interview.
2. Add the PostgreSQL adapter behind the same port.
3. Add accounts and ownership checks.
4. Replace the search mock.
5. Replace the answer and report mocks.
6. Store recordings and show screen sharing.
7. Deploy the separate services.

A later phase does not skip the port. A new search client, a new model, or a new database is a new adapter.
