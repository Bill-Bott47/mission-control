# Getting Started with JonathanOS

JonathanOS is an AI operating system built on [OpenClaw](https://openclaw.ai). It gives you a crew of specialized AI agents, a live dashboard, persistent memory, and automated workflows — all running on your own machine.

---

## What's in the Box

| Component | What it does |
|-----------|-------------|
| **Dashboard** | Live view of your agents, tasks, signals, and ops |
| **Agent Crew** | Specialized AI agents for research, trading, content, fitness, etc. |
| **Memory System** | Daily notes + long-term memory that persists across sessions |
| **Cron Jobs** | Automated tasks that run on schedule (briefs, research, monitoring) |
| **Heartbeat** | Internal engine that keeps agents on task and surfaces blockers |

---

## Prerequisites

- [OpenClaw](https://openclaw.ai) installed and configured
- At least one AI provider connected (Claude, OpenAI, or local Ollama)
- Python 3.9+ for the dashboard server

---

## Spinning Up Your First Agent

Agents in JonathanOS are just OpenClaw sessions with a custom prompt. Here's the pattern:

### 1. Define your agent's purpose
Every agent needs a clear role. Ask yourself:
- What does this agent monitor or produce?
- What channel does it report to?
- How often should it run?

### 2. Create the prompt
Keep it tight. A good agent prompt has:
- **Identity**: Who are you, what's your job
- **Output format**: What you produce and where it goes
- **Rules**: What you never do (see DO_NOT.md)
- **Context**: What files/data to read each session

```markdown
# Example: Research Agent

You are [Name], a research specialist for [Company].

Every session:
1. Read MEMORY.md for context
2. Check #research-center for open questions
3. Produce a 3-bullet summary and post to #inbox

Rules:
- Never send emails without approval
- Always cite sources
- Tag urgent findings with 🚨
```

### 3. Register in OpenClaw
Add your agent to `openclaw.json` under `sessions`:

```json
{
  "label": "my-research-agent",
  "model": "anthropic/claude-sonnet-4-6",
  "prompt": "agents/my-research-prompt.md"
}
```

### 4. Wire up a cron (optional)
For agents that run on schedule, add to `openclaw.json` under `crons`:

```json
{
  "id": "my-daily-research",
  "schedule": "0 8 * * *",
  "label": "my-research-agent",
  "message": "Run your daily research brief."
}
```

---

## Memory Architecture

Agents wake up fresh each session. Memory is what gives them continuity:

```
memory/
  2026-03-07.md    ← Daily log: what happened today
  2026-03-06.md    ← Yesterday
  ...
MEMORY.md          ← Long-term: curated facts, decisions, context
```

**Rule**: If you want an agent to remember something, write it to a file. Mental notes don't survive restarts.

---

## Model Tiers

Not every task needs the smartest model. Use the right tool:

| Tier | Model | Best for |
|------|-------|----------|
| Flagship | Claude Opus / GPT-5 | Accountability, high-stakes decisions |
| Ops | Claude Sonnet | Day-to-day ops, research, writing |
| Coding | Codex / GPT-5.2 | Code generation, PRs, builds |
| Fast | Gemini Pro | Research, summaries, structured data |
| Content | MiniMax M2.5 | Content creation, ideation |
| Local | Ollama (Qwen/Llama) | Mechanical tasks, crons, free |

---

## Dashboard

The dashboard runs locally at `http://localhost:8889` (or via Tailscale for remote access).

```bash
cd mission-control
python3 server.py
```

Key pages:
- `/` — Main dashboard (crew status, tasks, signals)
- `/tasks` — Full task tracker
- `/office/native` — Star Office (agent collaboration space)
- `/team` — Agent crew overview

---

## Task Protocol

Every task needs:
- **T-XXX** number (run `scripts/next-task-number.sh`)
- **Project:** field — no orphan tasks
- **Priority:** P1/P2/P3
- **Status:** OPEN / IN_PROGRESS / DONE

---

## Questions?

This OS is a living system. If you're building on it, the best way to understand it is to read:
1. `AGENTS.md` — How agents operate
2. `SOUL.md` — The operating philosophy
3. `HEARTBEAT.md` — The internal engine
4. `docs/jonathan-os.md` — Full architecture spec
