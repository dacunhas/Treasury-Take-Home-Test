# AGENTS.md — Roles, Coordination Contract & Operating Protocol

How the autonomous agents on this project work together. Read `CONTEXT.md` and
`PROJECT_PLAN.md` first — they are the spec. This file is the *process*.

## 0. Execution model (decided)

**Unattended builder pushes a reviewable PR; human owns every merge.** A scheduled
run plays builder: it builds and tests in the sandbox, then **pushes its slice to a
feature branch and opens a pull request** against `main` via the GitHub REST API,
and reports to Steve. **Steve reviews the PR on GitHub** (diff + the audit/compliance
notes in the PR body) and **merges it himself** — which triggers the Vercel deploy.
The builder **never merges to `main` and never deploys production.** This mirrors the
`site-build-agent` flow (`C:\Claude Projects\Life\site\build-agent-prompt.md`).

- **Repo:** https://github.com/dacunhas/Treasury-Take-Home-Test
- **Vercel:** https://vercel.com/stevedacunha0894-1399s-projects
- **Push mechanism — PAT + plain git, NOT the GitHub MCP connector** (the hosted
  connector is unreliable — known "dynamic client registration" bug). See §7 for the
  exact recipe. The fine-grained PAT lives at
  `C:\Claude Projects\Treasury Take Home Test\.secrets\github-pat.txt` (gitignored;
  read with the Read FILE TOOL, never via bash/`cat`; never printed/echoed/committed).
- **Secrets:** the core loop (scaffold, pure comparison engine, unit tests with a
  MOCKED extractor) needs NO inference keys. Live-extraction testing needs
  `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`, kept in `.env.local` in the connected
  folder (read-only use by a run; gitignored; never committed or echoed).

Constraints that shaped this (validated 6/9):
- Mounted paths (connected folder + outputs): create/edit OK, **delete blocked**,
  git/npm unusable by the sandbox there. So all git/npm work happens in `/tmp`.
- Non-mounted sandbox paths (`/tmp`, `$HOME`): full rw + working git + network
  (github.com is reachable — validated 6/9).
- Scheduled runs only fire while the Claude app is open (else at next launch).
- Each run is a cold session — the repo (`main` on GitHub) and the connected folder
  are the shared memory. Anything the spec doesn't cover is logged as a blocker,
  never guessed.
- **Bootstrap:** until `main` exists on the remote, the first run pushes the initial
  commit directly to `main` to establish it; every slice after that is a PR.

## 1. The file contract (shared memory)

Agents are stateless across runs. They coordinate ONLY through these files in the
repo root. Every run starts by reading them and ends by updating them.

| File | Owner (writes) | Everyone (reads) | Purpose |
|---|---|---|---|
| `planning/CONTEXT.md` | human | all | Spec / facts / requirements. Read-only for agents. |
| `planning/PROJECT_PLAN.md` | human | all | Architecture, engine spec, timeline, audit. Read-only for agents. |
| `planning/BUILD_BACKLOG.md` | builder (status), human (scope) | all | Ordered task list + status. Source of "what's next." |
| `PROGRESS.md` | builder | all | Running log: done, current state, decisions, next task, blockers. |
| `AUDIT.md` | code auditor | builder, human | Findings with severity + file/line + fix suggestion. |
| `COMPLIANCE.md` | compliance reviewer | builder, human | Pass/fail vs the §8 checklist + assignment criteria. |

Rules:
- Append-with-date to logs; don't silently overwrite history.
- An agent never edits another agent's file (except the builder marking a finding
  `Resolved` with a back-reference, which is allowed and encouraged).
- If two findings conflict, compliance (requirements) outranks audit (quality)
  outranks builder convenience.

## 2. Roles

### Builder
- **Goal:** implement the next backlog task as a complete vertical slice; keep it
  shippable.
- **Each session:** read CONTEXT, PLAN, BACKLOG, PROGRESS, and any unresolved
  AUDIT/COMPLIANCE findings → pick the next task → implement → write/extend unit
  tests → run tests → push a feature branch + open a PR (§7).
- **Must:** address open auditor/compliance findings before new features. Keep the
  comparison engine pure & tested. Never commit secrets. Surface blockers in
  PROGRESS.md rather than guessing on anything that contradicts the spec.
- **Human checkpoint:** the builder opens the PR; Steve reviews and **merges** it
  (the only thing that reaches `main` / triggers Vercel). The builder never merges.

### Code auditor (verification subagent)
- **Goal:** quality, security, correctness of the diff since last audit.
- **Checks:** clean module boundaries; engine is pure/deterministic/tested; no
  secrets or keys committed; input validation on the API route; error paths return
  friendly messages not stack traces; no obvious perf traps against the 5s budget;
  dead code; test coverage on the correctness core.
- **Output:** append to `AUDIT.md` — each finding tagged `BLOCKER / MAJOR / MINOR /
  NIT`, with file:line and a concrete fix. Read-only; never edits source.

### Compliance reviewer (verification subagent)
- **Goal:** are we building *to the assignment*? Maps work to requirements, not code
  taste.
- **Checks (against CONTEXT + PROJECT_PLAN §8):** all core field checks present;
  Government Warning exact-match + caps + diff; tolerant brand match (STONE'S THROW
  resolves to Match/Review); conditional ABV by beverage type (beer-optional,
  wine "Table Wine", spirits-required); 5s SLA on common path + conditional Sonnet
  escalation; batch mode; accessibility ("73-year-old" bar); stateless/no-PII;
  firewall seam documented; README + approach/assumptions doc present; deliverables
  (repo, deployed URL).
- **Output:** append to `COMPLIANCE.md` — each criterion `PASS / PARTIAL / FAIL +
  evidence + gap`. Read-only.

## 3. Operating protocol per scheduled run

```
1. Builder (unattended), in sandbox /tmp working copy (see §7):
   read CONTEXT, PLAN, BACKLOG, PROGRESS + open findings → copy current source
   from connected folder to /tmp/ttb-build → npm install → implement next slice →
   tests green (extractor MOCKED in unit tests).
2. Run verification subagents in parallel:
     - code auditor  → findings
     - compliance     → findings
3. Builder self-triage within the same run:
     - Issue it can safely fix → fix + re-test.
     - Anything needing a human decision, a secret, or contradicting the spec →
       leave as an open finding; do NOT guess.
     - MINOR/NIT/PARTIAL → log to BACKLOG for later (don't gold-plate).
4. Commit changed/new source + PROGRESS.md/AUDIT.md/COMPLIANCE.md/BACKLOG status into
   the `/tmp/ttb-repo` clone on a feature branch; push it; open a PR via the REST API
   (§7). No node_modules/.next. (Bootstrap: push to `main` if it doesn't exist yet.)
5. Report to Steve (run notification): slice built, test results, PR link + branch,
   diff summary, open findings, and "ready to review + merge" or "blocked on X."
6. HUMAN (GitHub): review the PR → merge to `main` (→ Vercel deploy) → `git pull` locally.
```

## 4. Cadence

- **Scheduled builder runs:** twice daily, Wed 6/10 → Sun 6/14 — an evening run
  (~6 PM ET) and an overnight run (~1 AM ET) — each producing one milestone slice
  written to the connected folder + an audit/compliance report. (Runs only while
  the Claude app is open; otherwise at next launch.)
- **Auditor + compliance:** run inside every builder run (not a separate schedule),
  plus a **hard final gate Mon 6/15** before submission — nothing should be pushed
  with an open BLOCKER or compliance FAIL.
- **Human merge cadence:** Steve reviews + merges the PR after each run he's happy
  with (evening run before bed, overnight run in the morning). No merge, no deploy.
- Do **not** run the builder more than ~once/day; reviewing churn is noise and
  unattended over-iteration risks drift from the spec.

## 5. Guardrails for autonomous runs

- Stop and surface a blocker (don't guess) when: the spec is contradicted, a secret
  is missing, the PAT is absent or any git/API call returns 401/403, auth/deploy
  fails, or a design choice isn't covered by CONTEXT/PLAN.
- Never mark a backlog task `done` with failing tests or an unimplemented
  acceptance criterion.
- Secrets only via env vars; never echo them into logs, PROGRESS, or commits.
- The slip rule from PROJECT_PLAN §7 holds: **batch mode is the cut line** — a
  flawless single-label core beats a half-working batch.

## 6. Definition of done (project)

Repo public with README + approach/assumptions doc; deployed URL live and tested
from a clean browser; PROJECT_PLAN §8 audit fully checked; `AUDIT.md` and
`COMPLIANCE.md` show no open BLOCKER / FAIL; submitted via the Treasury form.

## 7. Build environment & push mechanism (validated 6/9)

**git and npm do not work in mounted paths** (the sandbox can't remove lock files
there). They work fully in non-mounted `/tmp`, where github.com is also reachable.
So every run does ALL build/test/git work in `/tmp` and pushes to GitHub from there.
The builder NEVER writes source into the connected folder (that would create
uncommitted local changes that fight Steve's `git pull`); code reaches Steve only
through the PR he merges, then he pulls.

Paths (bash):
- Connected folder (mount): `/sessions/<id>/mnt/Treasury Take Home Test` — used to
  READ the spec (`planning/*.md`) and to READ `.secrets/` and `.env.local`. The
  builder does not write source here.
- Sandbox build dir: `/tmp/ttb-build` — npm install / build / test happen here.
- Sandbox repo clone: `/tmp/ttb-repo` — the authenticated clone the run commits and
  pushes from. Both are ephemeral (wiped between sessions).

### Per-run recipe

1. **Get the token (Read FILE TOOL only).** Read
   `C:\Claude Projec