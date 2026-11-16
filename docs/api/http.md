# PracticeRoom HTTP API

The Nest process prefixes every route with `api/v1` and listens on port 3000. It allows the page at `http://localhost:5173` to call these routes. Start it from the repository root:

```powershell
pnpm --filter @practice-room/api start
```

The controller calls use cases and session methods. It does not search, choose questions, or score answers itself.

## Implemented

### `GET /api/v1/health`

No authentication.

```json
{
  "status": "ok",
  "experienceLevels": ["entry", "mid", "senior"]
}
```

`experienceLevels` is the `ExperienceLevel` union from `@practice-room/shared-types`.

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
```

### `POST /api/v1/interviews`

Body is `JobInterviewInput` or `SkillInterviewInput`. The handler maps that body with `toInterviewConfiguration`, prepares the session with `MockSearchProvider`, and saves it.

The saved id is the fixed string `123` so the local page can reuse one interview. Creating again replaces that session. A restart clears the store.

Response:

```json
{
  "id": "123",
  "status": "ready",
  "title": "Software Engineer at Google",
  "sections": [
    { "name": "Background", "minutes": 10 },
    { "name": "Core concepts", "minutes": 10 },
    { "name": "Follow-ups", "minutes": 10 }
  ]
}
```

A skill interview title is the skills joined with a comma. Section names come from the interview type.

### `POST /api/v1/interviews/:id/start`

No body. Loads the session and calls `start`.

```json
{
  "status": "live",
  "sectionName": "Background",
  "prompt": "Discuss background for Software Engineer at Google. Use the job requirements and the public preparation sources.",
  "done": false
}
```

### `POST /api/v1/interviews/:id/answer`

The path ends in `answer`, not `answers`.

```json
{ "answer": "A developed answer that is longer than forty characters." }
```

The handler calls `answerInterview` with `MockAnswerEvaluator`. The response has the same turn fields as start. `done: true` means the status is `completed` and the prompt is `That completes the interview.`

### `POST /api/v1/interviews/:id/report`

No body. The handler calls `reportInterview` with `MockReportGenerator`. The session must already be `completed`. The response spreads `InterviewFeedback` and adds `status: "report_ready"`.

```json
{
  "status": "report_ready",
  "overallScore": 80,
  "criteria": [],
  "strengths": ["Developed answer in Background."],
  "improvements": [],
  "practiceTopics": []
}
```

An unknown id throws `NotFoundException`, which Nest returns as 404. A report before completion throws `Finish the interview before generating a report`.

## Not registered

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/interviews/:id` | Read status, plan, and transcript without changing them |

The engine checks do not need the server. The session check imports Nest source files, so run it with `tsx`:

```powershell
pnpm dlx tsx apps/api/src/interviews/interview-session.check.ts
```
