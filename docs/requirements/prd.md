# PracticeRoom product requirements

PracticeRoom is a mock-interview product. A candidate supplies either a job or a set of skills. The system prepares a timed interview, asks one question at a time, records the transcript, and returns a feedback report that quotes the candidate's own answers.

The product name shown to people is PracticeRoom. Package names are `practice-room`, `@practice-room/web`, `@practice-room/api`, and `@practice-room/shared-types`.

## Users

The only role implemented so far is the candidate. There is no account, sign-in, or administrator yet. Anyone who runs the interview engine locally is the candidate for that process.

## Ways to start an interview

Both forms become one `InterviewConfiguration` before research or questioning begins.

### Job interview

The candidate provides:

- Company, role, and job description. All three are required after trimming.
- Optional job URL and optional round.
- Interview type, experience level, difficulty, and duration in minutes.
- Optional focus areas.

`skills` is an empty list. Duration must be greater than 0. The company and role are what the public search is built from.

### Skill interview

The candidate provides at least one non-blank skill, plus interview type, experience level, difficulty, and duration. Focus areas are optional. There is no company, so no public company search runs.

Experience level is `entry`, `mid`, or `senior`. Difficulty is `easy`, `medium`, or `hard`. Interview type is `coding`, `technical`, `behavioral`, `system_design`, `hr`, or `mixed`.

## Interview behavior that is implemented

1. Prepare the session. Status moves from `draft` to `preparing` to `ready`.
2. For a job, build one public search query per site plus one company-site query, then ask a `SearchProvider` for pages. The provider in the repo returns example links. It does not open the internet.
3. Build a plan whose section minutes add up to `durationMinutes`. Each section has one question. A question may cite up to two source URLs.
4. Start the session. Status becomes `live` and the first question is recorded with an empty answer.
5. Each answer is stored on the current transcript row. An answer shorter than 40 characters gets one follow-up in the same section. Any later answer advances to the next section.
6. Answering the last section sets status to `completed`. The closing sentence is returned to the caller and is not stored as another answered question.
7. `reportInterview` scores the transcript through `ReportGenerator`, then the session sets status to `report_ready`. A second report, or a report before completion, throws.

A technical interview uses the sections Background, Core concepts, and Follow-ups. Coding uses Problem solving, Implementation, and Complexity. Behavioral uses Introduction, Past experience, and Reflection. System design uses Requirements, Design, and Tradeoffs. HR uses Introduction, Motivation, and Close. Mixed uses Introduction, Technical, and Behavioral.

## Feedback rules

The report has five criteria: technical accuracy, problem solving, communication clarity, answer relevance, and completeness.

- Answers that trim to nothing are ignored.
- If short answers outnumber developed answers, every criterion scores 40 with confidence `low`.
- Otherwise every criterion scores 80 with confidence `high`.
- `evidence` is a quote copied from one of the candidate's answers.
- Strengths name the sections with developed answers. Improvements and practice topics name the sections with short answers.
- The report does not score accent, appearance, emotion, or personality.

This scorer is a stand-in. A later model can replace the 40-character test. The report shape stays the same: score, evidence quote, explanation, and confidence.

## Public sources

Job research may target LeetCode, Glassdoor, GeeksforGeeks, Medium, Reddit, LinkedIn, AmbitionBox, ZipRecruiter, Stack Overflow, GitHub, IGotAnOffer, Blind, CareerCup, and the company site. Those pages are preparation material. They are not the company's confidential questions. The job description is the requirement the candidate supplied.

## Page behavior that is implemented

The React page at `http://localhost:5173` is the candidate's current interface.

- A form creates either mode. The page lists the plan sections and their minutes before the interview starts.
- The camera preview must be on before start. When the interview finishes, the page stops the camera. The preview is not uploaded and is not scored.
- The browser speaks each question. Speech recognition fills the answer box. The candidate submits the text after checking it. A typed answer is the fallback when recognition is unavailable.
- Code from the editor is sent with that answer, then the editor is cleared for the next question.
- The report shows the overall score and the strengths.
- Screen sharing is not offered on the page. It waits until a recording can be stored.

## Not required yet

Accounts, saved history, a real search API, stored recordings, and cloud deployment are out of this implementation. A session still disappears when the API process stops.

