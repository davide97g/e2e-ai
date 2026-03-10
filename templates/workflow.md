# e2e-ai Workflow Guide

This file explains how e2e-ai works and how to use it. Keep it as a reference in your `.e2e-ai/` folder.

---

## How It Works

e2e-ai converts manual browser recordings into stable, documented Playwright tests. An AI pipeline processes your recording through multiple stages, each producing an artifact that feeds the next.

```
record → transcribe → scenario → generate → refine → test → heal → qa
```

**In short:** You record yourself testing in the browser (optionally narrating what you're doing), and e2e-ai turns that into a production-ready Playwright test with QA documentation.

**Two ways to run it:**
- **CLI**: Run commands directly (`e2e-ai run --key PROJ-101`)
- **AI assistant**: Ask your AI tool (Claude Code, Cursor, etc.) — the MCP server guides it through the pipeline step by step, asking for your approval before starting

---

## Setup

After running `e2e-ai init`, you need a **context file** (`.e2e-ai/context.md`) that teaches the AI about your project's test conventions — fixtures, helpers, selectors, login flows, etc.

**How to create it:** Use the `init-agent` in your AI tool (Claude Code, Cursor, etc.). If you have the MCP server configured, the AI can scan your codebase automatically with `e2e_ai_scan_codebase`.

---

## The Standard Workflow

### 1. Record (`record`)

Opens Playwright codegen in your browser. You interact with your app while codegen captures every action.

```bash
e2e-ai record --key PROJ-101
```

**With voice** (default): Records your microphone while you narrate what you're testing. Press `R` to pause/resume audio. Your voice comments become test documentation.

**Without voice:**
```bash
e2e-ai record --key PROJ-101 --no-voice
```

**Output:** `codegen-<timestamp>.ts` + `voice-<timestamp>.wav` (if voice enabled)

### 2. Transcribe (`transcribe`)

Sends the voice recording to OpenAI Whisper. Gets back timestamped text segments and injects them as comments into the codegen file:

```typescript
// [Voice 00:12 - 00:15] "Now I'm checking the item list loads correctly"
await page.getByRole('button', { name: 'Items' }).click();
```

**Skipped automatically** if no voice recording exists.

### 3. Scenario (`scenario`)

Two AI agents process the codegen + transcript:

1. **transcript-agent** — Maps your voice comments to codegen actions, translates non-English speech, classifies what's test-relevant vs. noise
2. **scenario-agent** — Converts everything into a structured YAML test scenario with semantic steps and expected results

```yaml
name: "Items list: verify weekly view headers"
steps:
  - number: 1
    action: "Log in with valid credentials"
    expectedResult: "User is redirected to dashboard"
  - number: 2
    action: "Navigate to Items section"
    selector: "getByRole('button', { name: 'Items' })"
    expectedResult: "Items list is displayed"
```

**Without voice:** The scenario is generated from codegen actions alone (the AI infers intent from selectors and page structure).

### 4. Generate (`generate`)

The **playwright-generator-agent** takes the YAML scenario + your project context (`.e2e-ai/context.md`) and writes a complete `.test.ts` file using your project's fixtures, helpers, and conventions.

### 5. Refine (`refine`)

The **refactor-agent** improves the generated test:
- Replaces raw CSS selectors with semantic alternatives (`getByRole`, `getByText`)
- Uses your project's helper methods where available
- Adds proper timeouts to assertions
- Replaces `waitForTimeout()` with proper waits

### 6. Test (`test`)

Runs the test with Playwright, capturing traces, video, and screenshots.

- **If it passes** → moves to QA documentation
- **If it fails** → moves to self-healing

### 7. Heal (`heal`)

The **self-healing-agent** diagnoses the failure and patches the test. Up to 3 attempts, each trying a different fix strategy:

| Failure Type | Fix Strategy |
|---|---|
| Selector changed | Try semantic selectors, stable attributes |
| Timing issue | Add waits, increase timeouts |
| Element not interactable | Wait for enabled state, scroll into view |
| Assertion mismatch | Update expected values |
| Navigation failure | Add `waitForURL`, `waitForLoadState` |

Never removes assertions. Never changes test structure. Adds `// HEALED: <reason>` comments.

**Skipped automatically** if the test passes.

### 8. QA (`qa`)

The **qa-testcase-agent** generates formal QA documentation:
- Markdown test case (ID, preconditions, steps table, postconditions)
- Zephyr XML (optional, if configured)

---

## Running the Full Pipeline

```bash
# Everything in one command
e2e-ai run --key PROJ-101

# Without voice recording
e2e-ai run --key PROJ-101 --no-voice

# Start from a specific step (skip prior steps)
e2e-ai run --key PROJ-101 --from scenario

# Skip specific steps
e2e-ai run --key PROJ-101 --skip heal

# Common: generate from existing recording data
e2e-ai run --key PROJ-101 --from generate
```

---

## Workflow Variations

### With Issue Tracker (Jira / Linear)

Set `inputSource: 'jira'` or `'linear'` in config. The scenario step will fetch issue context (summary, acceptance criteria, labels) and use it to align the test scenario with the ticket.

```bash
e2e-ai run --key PROJ-101   # fetches Jira/Linear issue automatically
```

### Without Issue Tracker

Set `inputSource: 'none'` (default). Use any identifier as the key, or omit it entirely:

```bash
e2e-ai run --key login-flow
e2e-ai run my-session
```

### AI-Only (No Recording)

Write the YAML scenario manually or have it generated from an existing codegen file, then run the AI pipeline:

```bash
e2e-ai generate --key PROJ-101
e2e-ai test --key PROJ-101
e2e-ai heal --key PROJ-101
e2e-ai qa --key PROJ-101
```

### Existing Test Improvement

Refactor an existing test to follow project conventions:

```bash
e2e-ai refine --key PROJ-101
```

---

## Scanner Pipeline (Separate Workflow)

Scans your codebase to build a QA map of features, workflows, and test scenarios:

```bash
# 1. Extract AST (routes, components, hooks)
e2e-ai scan

# 2. AI analysis → features, workflows, scenarios
e2e-ai analyze

# 3. Push QA map to remote API (optional)
e2e-ai push
```

This is independent from the test pipeline — use it to get an overview of your app's testable surface.

---

## AI-Assisted Workflow (MCP)

If you have the e2e-ai MCP server configured, you can ask your AI assistant to run the pipeline for you. The MCP server teaches the AI how to orchestrate the workflow:

1. **You say:** "Run the full test pipeline for PROJ-101" (or any variation)
2. **AI plans:** Calls `e2e_ai_plan_workflow` → gets an ordered step list
3. **AI shows plan:** Presents the steps and asks for your approval
4. **You adjust:** "Skip voice" / "Start from generate" / "Looks good, go"
5. **AI executes:** Runs each step one at a time via `e2e_ai_execute_step`, reporting results between steps

Each step runs as a separate subagent (when supported by the AI platform) to keep context clean and focused. If a step fails, the AI stops and asks you what to do.

**Example prompts you can give your AI assistant:**
- "Run the full pipeline for PROJ-101"
- "Generate a test from the existing recording for PROJ-101, skip voice"
- "Just run test and heal for PROJ-101"
- "Scan the codebase and analyze features"
- "Refactor the test for PROJ-101"

---

## File Structure

After running the pipeline for `PROJ-101`:

```
.e2e-ai/
  config.ts              ← your configuration
  context.md             ← project context (teach AI your conventions)
  workflow.md            ← this file
  agents/                ← AI agent prompts (numbered by pipeline order)
    0.init-agent.md
    1_1.transcript-agent.md
    1_2.scenario-agent.md
    2.playwright-generator-agent.md
    3.refactor-agent.md
    4.self-healing-agent.md
    5.qa-testcase-agent.md
    6_1.feature-analyzer-agent.md
    6_2.scenario-planner-agent.md
  PROJ-101/              ← working files (codegen, recordings)

e2e/
  tests/PROJ-101/
    PROJ-101.yaml        ← generated scenario
    PROJ-101.test.ts     ← generated Playwright test

qa/
  PROJ-101.md            ← QA documentation
```

---

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...           # For LLM calls + Whisper transcription

# Optional
AI_PROVIDER=openai              # openai | anthropic
AI_MODEL=gpt-4o                 # Model override
ANTHROPIC_API_KEY=sk-ant-...    # If using Anthropic
BASE_URL=https://your-app.com   # Your application URL
```

---

## Quick Reference

| Command | What it does |
|---|---|
| `e2e-ai init` | Create config + copy agents |
| `e2e-ai record --key X` | Record browser session |
| `e2e-ai transcribe --key X` | Transcribe voice recording |
| `e2e-ai scenario --key X` | Generate YAML test scenario |
| `e2e-ai generate --key X` | Generate Playwright test |
| `e2e-ai refine --key X` | Refactor test with AI |
| `e2e-ai test --key X` | Run Playwright test |
| `e2e-ai heal --key X` | Auto-fix failing test |
| `e2e-ai qa --key X` | Generate QA documentation |
| `e2e-ai run --key X` | Run full pipeline |
| `e2e-ai scan` | Scan codebase AST |
| `e2e-ai analyze` | AI feature/scenario analysis |
| `e2e-ai push` | Push QA map to API |
