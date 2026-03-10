# e2e-ai

AI-powered E2E test automation pipeline. Takes you from a manual browser recording all the way to a stable, documented Playwright test — with optional Zephyr integration.

Includes a **codebase scanner** that builds a QA map of your application's features, workflows, and test scenarios using AI analysis.

## Quick Start

```bash
# Install
npm install e2e-ai

# Initialize config + copy agents
npx e2e-ai init

# Generate project context (use init-agent in your AI tool)
# → produces .e2e-ai/context.md

# Show all commands
npx e2e-ai --help

# Full pipeline for an issue
npx e2e-ai run --key PROJ-101

# Scan your codebase and generate a QA map
npx e2e-ai scan
npx e2e-ai analyze
```

## Architecture

e2e-ai has two main workflows:

### Test Pipeline

```
record -> transcribe -> scenario -> generate -> refine -> test -> heal -> qa
  |            |            |           |          |         |       |      |
codegen     whisper    transcript   scenario    refactor  playwright self-  QA doc
+ audio     + merge    + scenario     agent      agent    runner   healing  + export
              agent      agent                                     agent   agent
```

Each step produces an artifact that feeds the next. You can run the full pipeline or any step individually.

### Scanner Pipeline

```
scan -> analyze -> push
  |        |         |
 AST    feature    remote
 scan   analyzer   API
        + scenario  upload
        planner
```

Scans your codebase structure (routes, components, hooks), uses AI to identify features and workflows, generates test scenarios, and optionally pushes the QA map to a remote API.

## Commands

### `init` - Project Setup

Interactive wizard that creates `.e2e-ai/config.ts` and copies agent prompts to `.e2e-ai/agents/`.

```bash
npx e2e-ai init

# Non-interactive (use defaults)
npx e2e-ai init --non-interactive
```

After init, use the **init-agent** in your AI tool (Claude Code, Cursor, etc.) to generate `.e2e-ai/context.md`. This context file teaches all downstream agents about your project's test conventions. If you have the MCP server configured, the AI tool can call `e2e_ai_scan_codebase` to analyze your project automatically.

---

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

---

### `scan` - Codebase AST Scanner

Scans your codebase and extracts structural information: routes, components, hooks, imports, and dependencies.

```bash
# Scan using config defaults (scans src/)
npx e2e-ai scan

# Scan a specific directory
npx e2e-ai scan --scan-dir app

# Write output to a custom path
npx e2e-ai scan --output my-scan.json

# Disable file-level caching
npx e2e-ai scan --no-cache
```

**What it does**:
1. Collects all `.ts`, `.tsx`, `.js`, `.jsx` files matching configured include/exclude patterns
2. Parses each file with a regex-based TypeScript parser to extract imports, exports, components, and hooks
3. Extracts routes from Next.js App Router (`app/`) and Pages Router (`pages/`) conventions
4. Caches results per-file (by content hash) for fast incremental re-scans

**Output**: `ASTScanResult` JSON containing:
- `files` — all scanned files with imports, exports, line counts
- `routes` — extracted routes with paths, methods, dynamic segments, layout files
- `components` — React components with props, hook calls, export status
- `hooks` — custom hook definitions with dependencies
- `dependencies` — import graph edges between files

Default output location: `.e2e-ai/ast-scan.json`

**Options**:

| Flag | Description | Default |
|------|-------------|---------|
| `--output <file>` | Write output to specific file | `.e2e-ai/ast-scan.json` |
| `--scan-dir <dir>` | Directory to scan | from config (`src`) |
| `--no-cache` | Disable file-level caching | cache enabled |

### `analyze` - AI QA Map Generation

Analyzes an AST scan result using AI to identify features, workflows, components, and test scenarios.

```bash
# Analyze the default scan output
npx e2e-ai analyze

# Analyze a specific scan file
npx e2e-ai analyze path/to/ast-scan.json

# Only extract features (skip scenario generation)
npx e2e-ai analyze --skip-scenarios

# Write output to a custom path
npx e2e-ai analyze --output my-qa-map.json
```

**What it does** — two-stage AI pipeline:

1. **Stage 2 — Feature Analysis** (`feature-analyzer-agent`): Receives the AST scan and groups routes, components, and hooks into logical features and user-facing workflows. Identifies component roles (form, display, navigation, modal, layout, feedback) and maps API routes to workflow steps.

2. **Stage 3 — Scenario Planning** (`scenario-planner-agent`): Receives the feature map and generates test scenarios for each workflow. Covers happy paths, validation, error handling, edge cases, and permission checks. Assigns priorities (critical/high/medium/low) and links scenarios to specific workflow steps.

**Output**: `QAMapV2Payload` JSON containing:
- `features` — logical application features with routes and source files
- `workflows` — user journeys with ordered steps, API calls, conditional branches
- `components` — UI components with types, props, workflow references
- `scenarios` — test scenarios with steps, preconditions, expected outcomes, priorities

Default output location: `.e2e-ai/qa-map.json`

**Options**:

| Flag | Description | Default |
|------|-------------|---------|
| `--output <file>` | Write QA map to specific file | `.e2e-ai/qa-map.json` |
| `--skip-scenarios` | Only run feature analysis | both stages |

### `push` - Push QA Map to API

Pushes a generated QA map to a remote API endpoint.

```bash
# Push the default QA map
npx e2e-ai push

# Push a specific file
npx e2e-ai push path/to/qa-map.json

# Associate with a git commit
npx e2e-ai push --commit-sha abc123
```

**What it does**: Sends the `QAMapV2Payload` JSON as a POST request to the configured API endpoint with Bearer token authentication. The API responds with version info and auto-linking statistics.

**Requires** `push.apiUrl` and `push.apiKey` in config (or `E2E_AI_API_URL` / `E2E_AI_API_KEY` env vars).

**Options**:

| Flag | Description | Default |
|------|-------------|---------|
| `--commit-sha <sha>` | Git commit SHA to associate | - |

---

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

### Workflow 5: Codebase Scanner Pipeline

Generate a full QA map from your codebase structure:

```bash
# Step 1: Scan the codebase AST
npx e2e-ai scan

# Step 2: AI analysis → features, workflows, scenarios
npx e2e-ai analyze

# Step 3: Push to remote API (optional)
npx e2e-ai push
```

Or run stages selectively:

```bash
# Just extract features (no scenarios)
npx e2e-ai analyze --skip-scenarios

# Re-scan after code changes (cached, fast)
npx e2e-ai scan
npx e2e-ai analyze
```

## Configuration

Run `npx e2e-ai init` to generate `.e2e-ai/config.ts`:

```typescript
import { defineConfig } from 'e2e-ai/config';

export default defineConfig({
  // --- General ---
  inputSource: 'none',       // 'jira' | 'linear' | 'none'
  outputTarget: 'markdown',  // 'zephyr' | 'markdown' | 'both'

  // --- LLM ---
  llm: {
    provider: 'openai',      // 'openai' | 'anthropic'
    model: null,              // null = use agent defaults (gpt-4o)
    agentModels: {},          // per-agent overrides: { 'scenario-agent': 'gpt-4o-mini' }
  },

  // --- Paths ---
  paths: {
    tests: 'e2e/tests',
    scenarios: 'e2e/scenarios',
    recordings: 'e2e/recordings',
    transcripts: 'e2e/transcripts',
    traces: 'e2e/traces',
    workingDir: '.e2e-ai',
    qaOutput: 'qa',
  },

  // --- Scanner ---
  scanner: {
    scanDir: 'src',                         // root directory to scan
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/build/**',
      '**/.next/**', '**/*.test.*', '**/*.spec.*',
      '**/__tests__/**', '**/*.d.ts',
    ],
    cacheDir: '.e2e-ai/scan-cache',         // file-level parse cache
  },

  // --- Push (remote QA map API) ---
  push: {
    apiUrl: null,   // or set E2E_AI_API_URL env var
    apiKey: null,   // or set E2E_AI_API_KEY env var
  },

  // --- Recording ---
  voice: { enabled: true },
  playwright: {
    browser: 'chromium',
    timeout: 120_000,
    retries: 0,
    traceMode: 'on',
  },
});
```

All configuration lives inside the `.e2e-ai/` directory — no files at project root.

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
E2E_AI_API_URL=https://...      # Remote API for push command
E2E_AI_API_KEY=key-...          # API key for push command
```

## AI Agents

Eight specialized agents live in `agents/*.md`. Each has:
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
| `feature-analyzer-agent` | AST scan result | Features, workflows, components JSON | `analyze` |
| `scenario-planner-agent` | Features + workflows | Complete QA map with scenarios JSON | `analyze` |

You can customize agent behavior by editing the `.md` files directly. The frontmatter `model` field is the default model for that agent (overridable via `--model` or `config.llm.agentModels`).

## Output Directory Structure

Default paths (configurable via `.e2e-ai/config.ts`):

```
e2e/
  tests/<KEY>/         # .test.ts + .yaml scenario (+ optional Zephyr XML)
  traces/              # trace.zip + results.json

qa/                    # QA documentation .md files

.e2e-ai/
  config.ts            # project configuration
  context.md           # project context (generated by init-agent)
  agents/              # agent prompt definitions (.md files)
  <KEY>/               # per-issue working dir: codegen, recordings/, intermediate files
  ast-scan.json        # scan command output
  qa-map.json          # analyze command output
  scan-cache/          # file-level parse cache (gitignored)
```

## MCP Server

e2e-ai ships an MCP (Model Context Protocol) server that lets AI assistants interact with your project's test infrastructure directly. The server binary is `e2e-ai-mcp`.

### Setup

Add to your MCP client configuration:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "e2e-ai": {
      "command": "npx",
      "args": ["e2e-ai-mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add e2e-ai -- npx e2e-ai-mcp
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "e2e-ai": {
      "command": "npx",
      "args": ["e2e-ai-mcp"]
    }
  }
}
```

If e2e-ai is installed globally or as a project dependency, you can use the binary path directly instead of `npx`:

```json
{
  "command": "node",
  "args": ["node_modules/.bin/e2e-ai-mcp"]
}
```

### Available Tools

| Tool | Description | Input |
|------|-------------|-------|
| `e2e_ai_scan_codebase` | Scan project for test files, configs, fixtures, path aliases, and sample test content | `projectRoot?` (defaults to cwd) |
| `e2e_ai_validate_context` | Validate that a context markdown file has all required sections | `content` (markdown string) |
| `e2e_ai_read_agent` | Load an agent prompt by name — returns system prompt + config | `agentName` (e.g. `scenario-agent`) |
| `e2e_ai_get_example` | Get the example context markdown template | (none) |

### Usage with AI Assistants

Once configured, an AI assistant can:

1. **Scan your project** to understand its test structure, fixtures, and conventions
2. **Read agent prompts** to understand how each pipeline step works
3. **Validate context files** to ensure they have the right format before running commands
4. **Get the example template** as a starting point for writing `e2e-ai.context.md`

This enables AI assistants to help you set up e2e-ai, debug pipeline issues, and generate better project context files.

## Library API

e2e-ai also exports types and config helpers for programmatic use:

```typescript
import { defineConfig, loadConfig, getProjectRoot } from 'e2e-ai';
import type {
  E2eAiConfig,
  ResolvedConfig,
  ASTScanResult,
  QAMapV2Payload,
  FeatureV2,
  WorkflowV2,
  ScenarioV2,
  ComponentV2,
  PushResult,
} from 'e2e-ai';
```

## License

MIT
