# ADR 002: Search behind a provider interface

## Status

Accepted. The adapter implemented today is `MockSearchProvider`.

## Decision

Research calls `SearchProvider.search(query)`. The mock returns one example page per query at `https://example.com/${platform}`. Job mode builds a `site:` query for each public domain. Skill mode builds no queries.

## Why

The interview plan and the session can be tested without network access, API keys, or scraping. A later Tavily, Brave, or agent search tool implements the same interface. `runPublicResearch` already skips a provider call that rejects and drops duplicate URLs, so one failing site does not fail the whole preparation.

## Consequence

Current source links are examples, not pages fetched from Reddit, GeeksforGeeks, Glassdoor, or a company site. The product must not describe those example URLs as live research results.
