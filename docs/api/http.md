# PracticeRoom HTTP API

The Nest process prefixes every route with `api/v1` and listens on port 3000. Start it from the repository root:

```powershell
pnpm --filter @practice-room/api start
```

## Implemented

### `GET /api/v1/health`

No authentication.

Response:

```json
{
  "status": "ok",
  "experienceLevels": ["entry", "mid", "senior"]
}
```

`experienceLevels` is the `ExperienceLevel` union from `@practice-room/shared-types`. The handler imports that type so the API package and the shared package stay connected. PowerShell check:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
```

## Not HTTP yet

Creating an interview, preparing it, answering, and reading the report are method calls on `InterviewSession` in the same Node process. There is no route for them yet. When those routes are added, they should call the session methods rather than reimplement research, turns, or scoring.

The engine checks do not need the server:

```powershell
node --experimental-strip-types apps/api/src/interviews/interview-session.check.ts
```

## Planned routes

These routes are not registered. Names match the session methods so the later controller stays thin.

| Method | Path | Session call | Result |
|---|---|---|---|
| `POST` | `/api/v1/interviews` | `toInterviewConfiguration`, then `create` and `prepare` | Plan and status `ready` |
| `POST` | `/api/v1/interviews/:id/start` | `start` | First turn, status `live` |
| `POST` | `/api/v1/interviews/:id/answers` | `answer` | Next turn or `done: true` |
| `POST` | `/api/v1/interviews/:id/report` | `report` | `InterviewFeedback`, status `report_ready` |
| `GET` | `/api/v1/interviews/:id` | read `status`, `plan`, `transcript` | Current session |

`:id` requires a store. The session object currently lives only in memory, so these routes cannot be added honestly until a session can be saved and loaded.
