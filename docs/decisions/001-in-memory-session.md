# ADR 001: Keep the interview session in memory

## Status

Accepted for the current engine.

## Decision

`InterviewSession` holds status, plan, cursor, and transcript in the Node process. Nothing is written to PostgreSQL yet.

## Why

The rules for preparation, follow-ups, completion, and feedback can be proven with check scripts before a database, accounts, or HTTP ids exist. The state machine is already the writer of `status`, so a later repository only has to save the result of those methods.

## Consequence

A session is lost when the process exits. HTTP routes that look up an interview by id wait until a store exists. The planned tables are listed in `docs/database/schema.md` and are not created.
