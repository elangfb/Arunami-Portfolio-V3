# AGENTS.md

Guidance for AI agents working in this repo.

## Security

A full security review was completed on **2026-05-30**: see [`SECURITY_REVIEW.md`](./SECURITY_REVIEW.md) for all findings. They are **documented, not yet fixed** — read it before touching rules, reports, or auth, and don't reintroduce the same issues.

This is a **client-only React/Vite SPA** (Vercel) backed by **Firebase** (Firestore + Auth + Storage), with the **Anthropic API called from the browser**. There is no backend — all trust boundaries live in `arunami/firestore.rules` and the browser bundle. Therefore:

- **Firestore `list` rules must constrain the query to the caller**, not just cap `limit` — and the client query must include the matching `where(...)`.
- **Never interpolate user input into HTML strings unescaped** (the report builders are the known offenders); allowlist media URLs to `https://` Firebase Storage origins.
- **Keep secrets out of the bundle** — anything `VITE_`-prefixed ships to clients; server-side secrets belong in a Vercel serverless function.
- Validate forms with `zod` + `@hookform/resolvers` (both installed) before persisting; don't log raw AI responses or financial figures in production.
