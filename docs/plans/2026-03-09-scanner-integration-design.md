# Scanner Integration Design

**Date:** 2026-03-09
**Status:** Approved

## Summary

Move all QA scanner functionality from `qa-intelligence/packages/scanner/` into e2e-ai as new top-level CLI commands. Delete the scanner package from qa-intelligence. Agent behaviors live in markdown files following e2e-ai's existing pattern.

## New CLI Commands

| Command | Source | Purpose |
|---------|--------|---------|
| `e2e-ai scan` | Stage 1 (existing scanner) | AST scan of codebase, outputs JSON |
| `e2e-ai analyze` | Stages 2-3 (new) | AI feature/workflow identification + scenario generation |
| `e2e-ai push` | Existing push client | Upload QA map to remote API (optional) |

## New Agent Markdown Files

Two new agents in `agents/`:

- **`feature-analyzer-agent.md`** — Takes AST scan result, identifies features, workflows, and components. Outputs structured JSON (Stage 2).
- **`scenario-planner-agent.md`** — Takes feature/workflow definitions, generates test scenarios per workflow with categories and priorities. Outputs QA map v2 payload (Stage 3).

Users can override these in `.e2e-ai/agents/` as with all existing agents.

## File Structure (new/modified)

```
src/commands/
  scan.ts          # AST scanning command (from scanner's stage1/)
  analyze.ts       # AI analysis command (stages 2-3, calls agents)
  push.ts          # Push QA map to API (from scanner's push/)

src/scanner/       # Moved scanner internals
  scanner.ts       # Stage 1 orchestrator
  parsers/
    base.ts
    typescript.ts
  extractors/
    index.ts
    routes.ts
  types.ts         # AST types (inlined, no @qai/shared dependency)

agents/
  feature-analyzer-agent.md
  scenario-planner-agent.md
```

## Config Extension

Add to `e2e-ai.config.ts` Zod schema:

```ts
scanner: {
  scanDir: string,        // default: "src"
  include: string[],      // glob patterns
  exclude: string[],      // glob patterns
  cacheDir: string,       // default: ".e2e-ai/scan-cache"
}
push: {
  apiUrl?: string,        // optional remote API
  apiKey?: string,        // or E2E_AI_API_KEY env var
}
```

## Output

- `e2e-ai scan` writes JSON to `.e2e-ai/<key>/ast-scan.json` (or `--output` path)
- `e2e-ai analyze` writes JSON to `.e2e-ai/<key>/qa-map.json`
- `e2e-ai push` sends qa-map JSON to configured API (optional)

## Data Flow

```
Source Code
    | e2e-ai scan
AST JSON (.e2e-ai/<key>/ast-scan.json)
    | e2e-ai analyze
QA Map v2 JSON (.e2e-ai/<key>/qa-map.json)
    | e2e-ai push (optional)
Remote API -> qa-intelligence dashboard
```

## Cleanup (qa-intelligence)

- Delete `packages/scanner/` entirely
- Delete `packages/shared/` (only consumer was scanner)
- Update root `package.json` workspaces
- Remove scanner-related dependencies

## What stays the same

- e2e-ai's existing commands, agents, pipeline, config — untouched
- `utils/scan.ts` — stays as the lightweight scan for existing e2e pipeline
- MCP server — no changes needed
