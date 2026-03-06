# e2e-ai

AI-powered E2E test automation pipeline. Takes you from a manual browser recording all the way to a stable, documented Playwright test — with optional Zephyr integration.

## Quick Start

```bash
# Install
npm install e2e-ai

# Initialize config + project context
npx e2e-ai init

# Show all commands
npx e2e-ai --help

# Full pipeline for an issue
npx e2e-ai run --key PROJ-101

# Individual commands
npx e2e-ai scenario --key PROJ-101
npx e2e-ai generate --key PROJ-101
npx e2e-ai qa --key PROJ-101
```

## Architecture

```
                                    AI Agents (LLM)
                                         |
  record -> transcribe -> scenario -> generate -> refine -> test -> heal -> qa
    |            |            |           |          |         |       |      |
  codegen     whisper    transcript   scenario    refactor  playwright self-  QA doc
  + audio     + merge    + scenario     agent      agent    runner   healing  + export
                agent      agent                                     agent   agent
```

Each step produces an artifact that feeds the next. You can run the full pipeline or any step individually.

## Commands

### `init` - Project Setup

Interactive wizard that scans your codebase and generates configuration + project context.

```bash
npx e2e-ai init

# Non-interactive (use defaults)
npx e2e-ai init --non-interactive
```

### `record` - Browser Recording

Launches Playwright codegen with optional voice recording and trace capture.

```bash
# Record with voice + trace (default)
npx e2e-ai record --key PROJ-101

# Silent mode (no mic, no trace replay)
npx e2e-ai record --key PROJ-101 --no-voice --no-trace

# Generic session (no issue key)
npx e2e-ai record my-session
```

**What it does**: Spawns Playwright codegen. When `--key` is provided, files go to `<workingDir>/<KEY>/`. Press `R` during recording to pause/resume audio.

**Output**: `codegen-<timestamp>.ts` + `voice-<timestamp>.wav`

### `transcribe` - Voice Transcription

Sends the `.wav` recording to OpenAI Whisper and merges voice comments into the codegen file.

```bash
npx e2e-ai transcribe --key PROJ-101
npx e2e-ai transcribe path/to/recording.wav
```

**What it does**: Calls Whisper API for timestamped segments, generates a markdown summary table, and injects `// [Voice HH:MM - HH:MM] "text"` comments into the codegen file.

**Output**: `<session>-transcript.json` + `<session>-transcript.md`

### `scenario` - AI Scenario Generation

Analyzes the codegen + voice transcript and produces a structured YAML test scenario.

```bash
npx e2e-ai scenario --key PROJ-101
```

**What it does**: Two-step LLM pipeline:
1. **transcript-agent**: Maps voice comments to codegen actions, translates multilingual speech to English, classifies relevance
2. **scenario-agent**: Converts the narrative into a YAML scenario with numbered steps, semantic actions, selectors, and expected results

If no transcript exists, it generates the scenario from codegen actions alone.

**Output**: `<testsDir>/<KEY>/<KEY>.yaml`

### `generate` - AI Test Generation

Converts a YAML scenario into a complete Playwright test file following your project conventions.

```bash
npx e2e-ai generate --key PROJ-101
npx e2e-ai generate path/to/scenario.yaml
```

**What it does**: The **playwright-generator-agent** receives the scenario + project context (from `e2e-ai.context.md`) and produces a test using your project's fixtures, helpers, and conventions.

**Output**: `<testsDir>/<KEY>/<KEY>.test.ts` (+ optional Zephyr XML if configured)

### `refine` - AI Test Refactoring

Improves an existing test by replacing raw locators with project helpers and applying conventions.

```bash
npx e2e-ai refine --key PROJ-101
npx e2e-ai refine path/to/test.test.ts
```

**What it does**: The **refactor-agent** scans the test for:
- Hardcoded selectors that could use semantic alternatives
- CSS class chains that should be replaced with stable selectors
- Missing timeouts on assertions
- Raw Playwright code that could use existing project helpers
- `waitForTimeout()` calls that should be proper waits

**Output**: Updated test file in-place

### `test` - Test Runner

Runs a Playwright test with full trace/video/screenshot capture.

```bash
npx e2e-ai test --key PROJ-101
npx e2e-ai test path/to/test.test.ts
```

**What it does**: Spawns `npx playwright test` with trace, video, and screenshot capture enabled. Captures exit code, stdout/stderr, and trace path.

**Output**: Test results + trace files

### `heal` - AI Self-Healing

Automatically diagnoses and fixes a failing test using up to 3 retry attempts.

```bash
npx e2e-ai heal --key PROJ-101
```

**What it does**: The **self-healing-agent** receives the failing test + error output and:
1. Classifies the failure: `SELECTOR_CHANGED`, `TIMING_ISSUE`, `ELEMENT_NOT_INTERACTABLE`, `ASSERTION_MISMATCH`, `NAVIGATION_FAILURE`, `STATE_NOT_READY`
2. Produces a patched test with `// HEALED: <reason>` comments
3. Re-runs the test
4. If still failing, tries a different approach (up to 3 attempts)

Never removes assertions. Never changes test structure.

**Output**: Patched test file + healing log

### `qa` - QA Documentation

Generates formal QA documentation from a test.

```bash
npx e2e-ai qa --key PROJ-101
```

**What it does**: The **qa-testcase-agent** produces:
- **QA Markdown**: Test ID, Title, Preconditions, Steps Table, Postconditions, Automation Mapping
- **Zephyr XML** (optional): Import-ready XML if `outputTarget` includes `zephyr`

**Output**: `<qaDir>/<KEY>.md` (+ optional Zephyr XML)

### `run` - Full Pipeline

Executes all steps in sequence: `record -> transcribe -> scenario -> generate -> refine -> test -> heal -> qa`

```bash
# Full pipeline
npx e2e-ai run --key PROJ-101

# Skip recording, start from scenario
npx e2e-ai run --key PROJ-101 --from scenario

# Skip voice and healing
npx e2e-ai run --key PROJ-101 --no-voice --skip heal

# Skip interactive steps, just do AI generation from existing data
npx e2e-ai run --key PROJ-101 --from scenario --skip test,heal
```

**Options**:
- `--from <step>`: Start from a specific step (skips all prior steps)
- `--skip <steps>`: Comma-separated list of steps to skip

Each step's output feeds the next via `PipelineContext`. If a step fails, the pipeline stops (unless the step is marked `nonBlocking`).

## Typical Workflows

### Workflow 1: Full Recording Pipeline

Record from scratch for a new issue:

```bash
npx e2e-ai run --key PROJ-101
```

Opens the browser for recording, transcribes your voice, generates a scenario + test, runs it, heals failures, and produces QA docs.

### Workflow 2: AI-Only (No Recording)

When you already have a codegen file or want to write the scenario manually:

```bash
# 1. Write/edit the scenario YAML manually
# 2. Generate the test
npx e2e-ai generate --key PROJ-101

# 3. Run and iterate
npx e2e-ai test --key PROJ-101

# 4. Auto-heal if failing
npx e2e-ai heal --key PROJ-101

# 5. Generate QA docs
npx e2e-ai qa --key PROJ-101
```

### Workflow 3: Existing Test Improvement

```bash
# Refactor to use project helpers + conventions
npx e2e-ai refine --key PROJ-101

# Generate updated QA documentation
npx e2e-ai qa --key PROJ-101
```

### Workflow 4: From Existing Recording Data

When codegen + voice already exist:

```bash
# Transcribe the voice recording
npx e2e-ai transcribe --key PROJ-101

# Generate scenario from codegen + transcript
npx e2e-ai scenario --key PROJ-101

# Continue with generate -> test -> qa
npx e2e-ai run --key PROJ-101 --from generate
```

## Configuration

Run `npx e2e-ai init` to generate `e2e-ai.config.ts`:

```typescript
import { defineConfig } from 'e2e-ai/config';

export default defineConfig({
  inputSource: 'none',       // 'jira' | 'linear' | 'none'
  outputTarget: 'markdown',  // 'zephyr' | 'markdown' | 'both'
  voice: { enabled: true },
  llm: { provider: 'openai' },
  contextFile: 'e2e-ai.context.md',
});
```

See `templates/e2e-ai.context.example.md` for the project context file format.

## Global Options

| Flag | Description | Default |
|------|-------------|---------|
| `-k, --key <KEY>` | Issue key (e.g. `PROJ-101`, `LIN-42`) | - |
| `--provider <p>` | LLM provider: `openai` or `anthropic` | `openai` (or `AI_PROVIDER` env) |
| `--model <m>` | Override LLM model | `gpt-4o` / `claude-sonnet-4-20250514` |
| `-v, --verbose` | Show debug output (API calls, file paths) | off |
| `--no-voice` | Disable voice recording in `record` step | voice enabled |
| `--no-trace` | Disable trace replay after recording | trace enabled |

## Environment Variables

Required in `.env`:

```bash
OPENAI_API_KEY=sk-...          # Required for LLM calls + Whisper transcription
```

Optional:

```bash
AI_PROVIDER=openai              # openai | anthropic
AI_MODEL=gpt-4o                 # Model override
ANTHROPIC_API_KEY=sk-ant-...    # Required if AI_PROVIDER=anthropic
BASE_URL=https://...            # Your application URL
```

## AI Agents

Six specialized agents live in `agents/*.md`. Each has:
- **YAML frontmatter**: model, max_tokens, temperature
- **System prompt**: role + context
- **Input/Output schemas**: what the agent receives and must produce
- **Rules**: numbered constraints (e.g. "never remove assertions")
- **Examples**: concrete input/output pairs

| Agent | Input | Output | Used by |
|-------|-------|--------|---------|
| `transcript-agent` | codegen + transcript JSON | Structured narrative with intent mapping | `scenario` |
| `scenario-agent` | narrative + issue context | YAML test scenario | `scenario` |
| `playwright-generator-agent` | scenario + project context | `.test.ts` file | `generate` |
| `refactor-agent` | test + project context | Improved test file | `refine` |
| `self-healing-agent` | failing test + error output | Diagnosis + patched test | `heal` |
| `qa-testcase-agent` | test + scenario + issue data | QA markdown + test case JSON | `qa` |

You can customize agent behavior by editing the `.md` files directly. The frontmatter `model` field is the default model for that agent (overridable via `--model`).

## Output Directory Structure

Default paths (configurable via `e2e-ai.config.ts`):

```
e2e/
  tests/<KEY>/         # .test.ts + .yaml scenario (+ optional Zephyr XML)
  traces/              # trace.zip + results.json

qa/                    # QA documentation .md files

.e2e-ai/<KEY>/         # per-issue working dir: codegen, recordings/, intermediate files
```

## License

MIT
