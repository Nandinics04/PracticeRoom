# ADR 001: Keep the interview session in memory

## Status

Accepted for the current engine.

## Decision

`InterviewSession` holds status, plan, cursor, and transcript in the Node process. Nothing is written to PostgreSQL yet.

## Why

The rules for preparation, follow-ups, completion, and feedback can be proven with check scripts before a database or accounts exist. The state machine is already the writer of `status`, so a later repository only has to save the result of those methods.

## Consequence

`SessionStore` keeps the sessions in a `Map`. A session is lost when the process exits. The HTTP routes load by id from that map. The planned tables are listed in `docs/database/schema.md` and are not created.
