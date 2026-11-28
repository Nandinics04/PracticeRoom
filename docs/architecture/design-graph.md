# PracticeRoom — full design graph

**Product:** PracticeRoom  
**Repo folder:** HirePro  
**Live production:** https://hirepro-nandini.fly.dev/  
**Related:** [current-state.md](../current-state.md) · [deploy.md](../deploy.md) · design patterns under `.cursor/rules/`

This file is the **whole-system design view**: deployment, packages, request paths, interview state, prepare/live LLM graph, and behavioral arc.

---

## 1. System context

```mermaid
flowchart LR
  user[Candidate browser]
  fly[Fly.io hirepro-nandini]
  groq[Groq LLM and Whisper]

  user -->|"HTTPS same-origin"| fly
  fly -->|"chat + Whisper"| groq
```

What the candidate’s browser talks to:

- **UI** — React SPA (Kokoro TTS, Silero VAD, Monaco for coding)
- **API** — Nest `/api/v1/*` (cookie auth, SQLite, interview use cases)
- **AI worker** — Python `room_worker` (spawned by Nest; not a separate public URL)

---

## 2. Production deployment graph

```mermaid
flowchart TB
  subgraph internet [Internet]
    browser[Browser]
  end

  subgraph flyApp [Fly machine runtime-prod]
    nginx[nginx :8080]
    nest[Nest API :3000]
    worker[Python room_worker stdin JSON]
    sqlite[(SQLite /data volume)]
  end

  groq[Groq API]

  browser -->|"/ and static"| nginx
  browser -->|"/api/*"| nginx
  nginx -->|"proxy"| nest
  nest -->|"spawn + JSON lines"| worker
  nest --> sqlite
  worker --> groq
```

Local Docker Compose is the same idea split into two containers (`web` nginx + `api`), still proxied so the browser can use one origin on `:8080`.

---

## 3. Repository / package graph

```mermaid
flowchart TB
  root[practice-room pnpm workspace]

  web["@practice-room/web Vite React"]
  api["@practice-room/api NestJS"]
  types["@practice-room/shared-types"]
  ai[apps/ai-service Python]

  root --> web
  root --> api
  root --> types
  web --> types
  api --> types
  api -->|"child process"| ai
```

| Path | Responsibility |
|------|----------------|
| `apps/web` | Studio UI, voice, live room, report view |
| `apps/api` | HTTP, auth, SQLite, use cases, Python bridge |
| `apps/ai-service` | Prepare, live reply, evaluate, Whisper, graphs |
| `packages/shared-types` | Interview / feedback TypeScript types |

---

## 4. Design patterns (API)

```mermaid
flowchart LR
  ctrl[InterviewsController]
  uc[Use cases prepare answer report]
  port[Ports SessionRepository SearchProvider AnswerEvaluator]
  adapt[Adapters SqliteStore FileStore Mock* PythonRoom]
  domain[InterviewSession + SessionStateMachine]
  strategy[InterviewStrategy per type]
  plan[buildInterviewPlan]

  ctrl --> uc
  uc --> port
  uc --> domain
  port --> adapt
  domain --> strategy
  uc --> plan
```

Rules encoded in code:

- **State** — only `SessionStateMachine.transition` changes status (load may assign saved status).
- **Factory** — `InterviewSession.create` / `fromRecord`.
- **Builder** — `buildInterviewPlan`.
- **Strategy** — section names, weights, follow-up claims by `interviewType`.
- **Port / adapter** — controllers depend on ports; Nest module picks adapters.

---

## 5. Session state machine

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> preparing: prepare
  preparing --> ready: plan_ready
  preparing --> failed: fail
  ready --> live: start
  ready --> failed: fail
  live --> completed: end
  live --> failed: fail
  completed --> report_ready: report_ready
  report_ready --> [*]
  failed --> [*]
```

---

## 6. End-to-end candidate journey

```mermaid
sequenceDiagram
  participant U as Browser
  participant N as Nest API
  participant P as Python room_worker
  participant G as Groq

  U->>N: signup / login cookie
  U->>N: POST /interviews prepare
  N->>P: prepare
  P->>G: blueprint questions
  G-->>P: section seeds
  P-->>N: plan questions
  N-->>U: ready room

  U->>N: POST start
  N-->>U: greeting prompt

  loop each answer
    U->>N: POST answer or transcribe
    N->>P: reply
    P->>G: shadow and/or conductor
    G-->>P: next_action + spoken_line
    P-->>N: prompt action
    N-->>U: next spoken question
  end

  U->>N: POST report
  N->>P: report path
  N-->>U: scorecard
```

---

## 7. HTTP surface (`/api/v1`)

```mermaid
flowchart TB
  auth[auth signup login logout me profile]
  health[health]
  iv[interviews CRUD]
  live[start answer transcribe code end report]

  auth --- health
  iv --- live
```

| Area | Routes |
|------|--------|
| Health | `GET /health` |
| Auth | `POST /auth/signup`, `login`, `logout`; `GET /auth/me`; `PATCH /auth/profile` |
| Interviews | `POST/GET /interviews`, `GET/DELETE /:id`, `GET /companies` |
| Live | `POST /:id/start`, `answer`, `transcribe`, `code`, `end`, `report` |

---

## 8. Interview type → section strategy

```mermaid
flowchart TB
  type[interviewType]

  type --> technical[Background Core concepts Follow-ups]
  type --> behavioral[Warm-up Resume Deep-Dive Core Competency Culture Fit]
  type --> coding[Problem solving Implementation Complexity]
  type --> design[Requirements Design Tradeoffs]
  type --> hr[Introduction Motivation Close]
  type --> mixed[Introduction Technical Behavioral]
```

**Behavioral minutes (30‑minute room):** Warm-up **3** · Resume Deep-Dive **8** · Core Competency **14** · Culture Fit **5**.

Timers are **deterministic in Nest** (section budget / soft 80% wrap / hard 100% leave). The LLM does not own the clock.

---

## 9. Prepare graph (before live)

```mermaid
flowchart TD
  form[Resume JD role level type]
  nest[buildInterviewPlan sections + minutes]
  prepare[prepare_questions]

  form --> nest --> prepare

  prepare --> tech{type?}
  tech -->|technical| tg[plan_technical_interview 70b CoT]
  tech -->|behavioral| bg[plan_behavioral_interview 70b CoT]
  tech -->|other| fast[PREPARE_FAST / draft fallback]

  tg --> seeds[One seed question per section + private followUp claim]
  bg --> seeds
  fast --> seeds
  seeds --> cache[Temp plan cache]
  seeds --> session[InterviewSession.ready]
```

Theme banks (behavioral) inspire questions; they are **not** fixed scripts. Planner uses private `reasoning` (chain-of-thought), then emits spoken seeds.

---

## 10. Live turn graph (Shadow + Conductor)

Used for **technical** and **behavioral** content turns (Nest orchestration + Python reply).

```mermaid
flowchart TD
  answer[Candidate answer]
  time[Nest sectionElapsed vs budget]
  time --> soft{elapsed >= 80 percent?}
  time --> hard{elapsed >= 100 percent or opt-out?}

  soft -->|yes| wrap[wrapUpSection flag]
  hard -->|yes| leave[Advance section]

  answer --> shadow[Shadow Evaluator fast model JSON]
  wrap --> shadow
  shadow --> action[next_action]

  action --> probe[PROBE_DEEPER / PIVOT_HARDER / GIVE_HINT]
  action --> move[MOVE_NEXT_TOPIC]
  action --> star[Behavioral: PROBE_ACTION / PROBE_RESULT / CHALLENGE_DECISION]

  probe --> stay[Stay in section]
  star --> stay
  move --> stayOrLeave[Fresh same-section ask or leave if hard time]

  stay --> conductor[Conductor 70b spoken_line]
  stayOrLeave --> conductor
  leave --> personalize[Personalize next section seed]
  conductor --> speak[One question to browser + Kokoro]
  personalize --> speak
```

| Role | Model (typical Groq) | Speaks to user? |
|------|----------------------|-----------------|
| Shadow evaluator | 8B structured JSON | No |
| Conductor / live | 70B spoken_line | Yes |
| Background `seed_next` | 8B | Prepares next seed only |

**Conductor rules:** one question per turn; credit one detail from the answer; never recite seeds verbatim; type-lock (no STAR leakage into technical).

---

## 11. Dual-LLM pacing (background prep)

```mermaid
sequenceDiagram
  participant Live as Conductor live
  participant Nest as Nest evaluator
  participant Bg as seed_next background

  Note over Nest: Section A live
  Nest->>Live: reply for section A
  Nest->>Bg: personalize section B seed
  Live-->>Nest: spoken_line
  Bg-->>Nest: preparedNext stored on cursor

  Note over Nest: When section A time ends
  Nest->>Live: speak preparedNext for section B
  Nest->>Bg: personalize section C
```

While LLM‑1 (live) is on the current section, LLM‑2 (background) can prepare the next section’s first question from the last answer + plan seed.

---

## 12. Behavioral competency arc

```mermaid
flowchart LR
  w[Warm-up and Pitch ~3m]
  r[Resume Deep-Dive ~8m]
  c[Core Competency Scenarios ~14m]
  f[Culture Fit and Reverse Q and A ~5m]
  wrap[Optional wrap-up]

  w --> r --> c --> f --> wrap
```

| Section | Theme bank examples (inspiration only) |
|---------|----------------------------------------|
| Warm-up | Pitch, background, motivation, strengths |
| Resume | Internship/project ownership, decisions, learning |
| Core competency | Ownership, disagreement, deadlines, mistakes, feedback |
| Culture fit | Why company, environment, reverse questions |

Shadow checks STAR completeness and pronoun ownership (`I` vs `we`); Conductor probes action/result or transitions.

---

## 13. Data graph

```mermaid
erDiagram
  USER ||--o{ AUTH_SESSION : has
  USER ||--o{ INTERVIEW_SESSION : owns
  INTERVIEW_SESSION ||--o| PLAN : has
  INTERVIEW_SESSION ||--o{ TRANSCRIPT_ENTRY : contains
  INTERVIEW_SESSION ||--o| FEEDBACK : produces

  USER {
    string id
    string email
    string password_hash
    string target_role
  }
  AUTH_SESSION {
    string token_hash
    string user_id
  }
  INTERVIEW_SESSION {
    string id
    string status
    json config
    json cursor
  }
  PLAN {
    json sections
    int totalMinutes
  }
  TRANSCRIPT_ENTRY {
    string prompt
    string answer
    json evaluation
  }
  FEEDBACK {
    int overallScore
    json criteria
  }
```

Persistence today: one SQLite file under `PRACTICE_ROOM_DATA_DIR` (Fly volume `/data`).

---

## 14. Voice / media path (browser)

```mermaid
flowchart LR
  prompt[Interviewer prompt]
  kokoro[Kokoro WASM TTS]
  speak[Speaker]
  mic[Mic + Silero VAD]
  wav[WAV upload]
  whisper[Whisper via API]
  text[Answer text]

  prompt --> kokoro --> speak
  mic --> wav --> whisper --> text
  text --> apiAnswer[POST answer]
```

Camera/mic stay in the browser; only audio (or typed text) and code go to the API.

---

## 15. File map (where the graph lives in code)

| Concern | Primary files |
|---------|----------------|
| HTTP + CORS | `apps/api/src/main.ts`, `interviews.controller.ts`, `auth/*` |
| Use cases | `apps/api/src/application/interview/*` |
| Session / state | `interview-session.ts`, `session-state.ts`, `interviewer.ts` |
| Strategy / minutes | `interview-strategy.ts`, `plan.ts` |
| Python bridge | `python-room.ts`, `room_worker.py` |
| Prepare / live | `server.py`, `technical_graph.py`, `behavioral_graph.py` |
| Web live room | `apps/web/src/App.tsx`, `room/*`, `interviewer-voice*` |
| Deploy | `Dockerfile`, `fly.toml`, `deploy/start-prod.sh`, `docs/deploy.md` |

---

## 16. What is intentionally out of band

- No hire/reject badge on the report  
- No scoring of accent, appearance, or emotion  
- Search provider may return empty/local stubs (not a full open-web crawler requirement)  
- LLM never owns wall-clock section timing  

For “what works today” narrative detail, see [current-state.md](../current-state.md). For Fly commands and troubleshooting, see [deploy.md](../deploy.md).
