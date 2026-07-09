# getmeajob — an agentic job search

Job searching is a full-time job: hunting postings, retyping the same answers into every
Greenhouse/Ashby/Lever form, guessing whether you're a fit, and losing track of what you applied
to. This app hands all of it to an agent.

## What it does

1. **Sign in with Google** — one account for identity *and* (with your consent) read-only Gmail
   access so the tracker can watch for recruiter replies.
2. **Upload your resume once** — parsed (PDF/DOCX), stored, attached to every application.
3. **Answer the ATS questions once** — the app harvests the real application-form questions from
   live Greenhouse and Ashby boards (plus the canonical set shared with Lever/Jobvite forms:
   work authorization, sponsorship, EEOC self-ID, salary, notice period, …). You answer them a
   single time and they're stored.
4. **Tell it your target roles** — titles, locations, remote preference.
5. **Job search** — sweeps live public job boards across the web (Greenhouse, Lever, Ashby company
   boards + Remotive + Arbeitnow) for postings matching your titles.
6. **Multi-select match check** — select any number of jobs and get an ATS-style match % for each:
   skill overlap (50%), title alignment (20%), experience requirements (15%), education (5%),
   keyword coverage (10%), with matched/missing skills shown.
7. **Auto-apply at your threshold** (default ≥95%) — fills the hosted application form with your
   stored answers and resume via a headless browser and submits. Scores are recomputed server-side;
   duplicates are skipped.
8. **Tracking** — every application is recorded with date, match rate, method, and status.
9. **Inbox sync** — scans your Gmail for replies about tracked applications, classifies them
   (received / assessment / interview / offer / rejected), and moves the tracker forward.

## Stack

- **Next.js 14** (App Router, TypeScript) — frontend + API routes
- **Prisma + SQLite** (swap `DATABASE_URL` for Postgres in production)
- **NextAuth** with Google OAuth (`gmail.readonly` scope)
- **Tailwind CSS**
- **playwright-core** for the auto-apply form filler
- Public ATS APIs: `boards-api.greenhouse.io`, `api.lever.co/v0/postings`,
  `api.ashbyhq.com/posting-api` — plus Remotive and Arbeitnow job APIs

## Getting started

```bash
npm install
cp .env.example .env      # fill in Google OAuth credentials + NEXTAUTH_SECRET
npm run db:push           # create the SQLite schema
npm run dev
```

Google OAuth setup: create OAuth credentials at console.cloud.google.com, enable the **Gmail API**,
add `http://localhost:3000/api/auth/callback/google` as a redirect URI, and add the
`.../auth/gmail.readonly` scope on the consent screen.

### Applying: review-and-submit vs fully automatic

By default (`AUTO_APPLY_LIVE=false`) nothing is ever submitted without you. Applications land in
the tracker as `needs_review`, and **Review & submit** (on the Applications page, or automatically
after a one-click Apply) opens a real browser window with the form pre-filled from your stored
answers and your resume attached — you look it over and hit Submit yourself. The app watches the
tab and flips the status to `submitted` when the ATS confirmation page appears.

Set `AUTO_APPLY_LIVE=true` to let bulk auto-apply click Submit on its own for jobs at or above
your match threshold. Either way, `PLAYWRIGHT_EXECUTABLE_PATH` can point at any Chrome/Chromium
binary; if unset, common install locations are probed automatically. Applications you submit are
your own responsibility.

## Architecture notes

- `src/lib/ats/` — per-ATS connectors, the board directory (`boards.ts` — add any company token),
  the aggregator, and the live question harvester.
- `src/lib/matching.ts` — the ATS-style scoring engine.
- `src/lib/autoapply/` — answer mapping (synonym + heuristic label matching) and the headless
  browser form filler; Greenhouse applications get a required-question coverage pre-check via the
  public API before any submission attempt.
- `src/lib/gmail.ts` — token refresh + inbox search + reply classification; statuses only move
  forward (a late confirmation email can't downgrade "interview").
