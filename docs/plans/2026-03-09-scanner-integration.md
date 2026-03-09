# Scanner Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move QA scanner from qa-intelligence into e2e-ai as new CLI commands (scan, analyze, push) with markdown-based agents.

**Architecture:** Port scanner internals to `src/scanner/`, add 3 new commands following existing e2e-ai patterns, create 2 agent markdown files for AI stages, extend config schema with `scanner` and `push` sections, then delete the scanner package from qa-intelligence.

**Tech Stack:** TypeScript, commander.js, glob, bun, existing e2e-ai agent/LLM system

---

### Task 1: Add types file for scanner

**Files:**
- Create: `src/scanner/types.ts`

**Step 1: Create the types file**

Inline all AST + QA map types from `@qai/shared` (no external dependency):

```ts
// === AST Scanner Types (Stage 1) ===

export interface ASTScanResult {
  version: '1.0';
  scannedAt: string;
  language: string;
  stats: { totalFiles: number; totalLines: number };
  files: FileNode[];
  routes: RouteNode[];
  components: ComponentNode[];
  hooks: HookNode[];
  dependencies: DependencyEdge[];
}

export interface FileNode {
  path: string;
  language: string;
  lines: number;
  exports: string[];
  imports: ImportInfo[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
}

export interface RouteNode {
  path: string;
  filePath: string;
  method?: string;
  isDynamic: boolean;
  layoutFile?: string;
}

export interface ComponentNode {
  name: string;
  filePath: string;
  props: string[];
  isExported: boolean;
  hasJSX: boolean;
  hookCalls: string[];
}

export interface HookNode {
  name: string;
  filePath: string;
  isCustom: boolean;
  dependencies: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  specifiers: string[];
}

// === V2 QA Map Types ===

export interface FeatureV2 {
  id: string;
  name: string;
  description: string;
  routes: string[];
  workflowIds: string[];
  sourceFiles: string[];
}

export interface WorkflowV2 {
  id: string;
  name: string;
  featureId: string;
  type: 'navigation' | 'crud' | 'multi-step' | 'configuration' | 'search-filter';
  preconditions: string[];
  steps: WorkflowStepV2[];
  componentIds: string[];
}

export interface WorkflowStepV2 {
  id: string;
  order: number;
  description: string;
  componentIds: string[];
  apiCalls: string[];
  conditionalBranches: ConditionalBranch[];
}

export interface ConditionalBranch {
  condition: string;
  outcome: string;
  type: 'validation' | 'permission' | 'error' | 'business-logic';
}

export interface ComponentV2 {
  id: string;
  name: string;
  type: 'form' | 'display' | 'navigation' | 'modal' | 'layout' | 'feedback';
  sourceFiles: string[];
  props: string[];
  referencedByWorkflows: string[];
}

export type ScenarioCategory =
  | 'happy-path'
  | 'permission'
  | 'validation'
  | 'error'
  | 'edge-case'
  | 'precondition';

export type ScenarioPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ScenarioStep {
  order: number;
  action: string;
  expectedResult: string;
}

export interface ScenarioV2 {
  id: string;
  workflowId: string;
  featureId: string;
  name: string;
  description: string;
  category: ScenarioCategory;
  preconditions: string[];
  steps: ScenarioStep[];
  expectedOutcome: string;
  componentIds: string[];
  workflowStepIds: string[];
  priority: ScenarioPriority;
}

export interface QAMapV2Payload {
  features: FeatureV2[];
  workflows: WorkflowV2[];
  components: ComponentV2[];
  scenarios: ScenarioV2[];
  commitSha?: string;
  metadata?: Record<string, unknown>;
}

export interface PushResult {
  version: number;
  schemaVersion: number;
  appId: string;
  pushedAt: string;
  stats: {
    features: number;
    workflows: number;
    components: number;
    scenarios: number;
    autoLinkedScenarios: number;
  };
}
```

**Step 2: Commit**

```bash
git add src/scanner/types.ts
git commit -m "feat(scanner): add AST and QA map type definitions"
```

---

### Task 2: Port the TypeScript parser

**Files:**
- Create: `src/scanner/parsers/base.ts`
- Create: `src/scanner/parsers/typescript.ts`

**Step 1: Create the parser interface**

`src/scanner/parsers/base.ts`:
```ts
import type { FileNode, RouteNode, ComponentNode, HookNode, DependencyEdge } from '../types.ts';

export interface ParseResult {
  file: FileNode;
  routes: RouteNode[];
  components: ComponentNode[];
  hooks: HookNode[];
  dependencies: DependencyEdge[];
}

export interface LanguageParser {
  extensions: string[];
  parse(filePath: string, content: string): Promise<ParseResult>;
}
```

**Step 2: Port the TypeScript parser**

Copy `qa-intelligence/packages/scanner/src/stage1/parsers/typescript.ts` to `src/scanner/parsers/typescript.ts`. Change import paths from `../types` to `../types.ts` and `./base` to `./base.ts`.

The class body stays identical — it's self-contained regex parsing with no external deps.

**Step 3: Commit**

```bash
git add src/scanner/parsers/
git commit -m "feat(scanner): port TypeScript regex parser"
```

---

### Task 3: Port the route extractor

**Files:**
- Create: `src/scanner/extractors/routes.ts`
- Create: `src/scanner/extractors/index.ts`

**Step 1: Port routes.ts**

Copy `qa-intelligence/packages/scanner/src/stage1/extractors/routes.ts` to `src/scanner/extractors/routes.ts`. Update import: `from '../types'` → `from '../types.ts'`.

The code uses only `node:fs` and `node:path` — no external deps.

**Step 2: Create barrel export**

`src/scanner/extractors/index.ts`:
```ts
export { extractRoutes } from './routes.ts';
```

**Step 3: Commit**

```bash
git add src/scanner/extractors/
git commit -m "feat(scanner): port Next.js route extractor"
```

---

### Task 4: Port the Stage 1 scanner orchestrator

**Files:**
- Create: `src/scanner/scanner.ts`

**Step 1: Port scanner.ts**

Copy `qa-intelligence/packages/scanner/src/stage1/scanner.ts` to `src/scanner/scanner.ts`. Changes needed:

1. Update all imports to use `.ts` extensions and new paths:
   - `./parsers/typescript` → `./parsers/typescript.ts`
   - `./extractors` → `./extractors/index.ts`
   - `./types` → `./types.ts`
2. Remove the `QAIConfig` import. Instead, define a local interface:
   ```ts
   export interface ScannerConfig {
     scanDir: string;
     include: string[];
     exclude: string[];
     cacheDir: string;
   }
   ```
3. Change `runStage1(config: QAIConfig)` → `runStage1(config: ScannerConfig)`
4. Replace `console.log` with imports from `../utils/logger.ts` (`log.info`, `log.verbose`)
5. Replace `require("glob")` with top-level `import { globSync } from 'glob'` (glob is already a transitive dep, but we'll add it explicitly in Task 7)

**Step 2: Commit**

```bash
git add src/scanner/scanner.ts
git commit -m "feat(scanner): port Stage 1 scanner orchestrator"
```

---

### Task 5: Add the `scan` command

**Files:**
- Create: `src/commands/scan.ts`
- Modify: `src/cli.ts` (add import + registration)

**Step 1: Create the scan command**

`src/commands/scan.ts`:
```ts
import type { Command } from 'commander';
import { join } from 'node:path';
import { resolveCommandContext } from './_shared.ts';
import { runStage1 } from '../scanner/scanner.ts';
import { writeFile } from '../utils/fs.ts';
import * as log from '../utils/logger.ts';
import { createSpinner } from '../utils/ui.ts';

export function registerScan(program: Command) {
  program
    .command('scan')
    .description('Scan codebase AST (routes, components, hooks, imports)')
    .option('--output <file>', 'Write output to specific file')
    .option('--scan-dir <dir>', 'Directory to scan (default: from config)')
    .option('--no-cache', 'Disable file-level caching')
    .action(async (opts) => {
      const ctx = await resolveCommandContext(program);
      const root = ctx.paths.projectRoot;

      const scanDir = opts.scanDir ?? ctx.config.scanner.scanDir;
      const cacheDir = join(root, ctx.config.scanner.cacheDir);
      const scanConfig = {
        scanDir: join(root, scanDir),
        include: ctx.config.scanner.include,
        exclude: ctx.config.scanner.exclude,
        cacheDir: opts.cache === false
          ? join(cacheDir, `no-cache-${Date.now()}`)
          : cacheDir,
      };

      const spinner = createSpinner();
      spinner.start('Scanning codebase...');
      const ast = await runStage1(scanConfig);
      spinner.stop();

      // Determine output path
      const outputPath = opts.output
        ?? (ctx.key
          ? join(ctx.paths.workingDir, ctx.key, 'ast-scan.json')
          : join(root, '.e2e-ai', 'ast-scan.json'));

      writeFile(outputPath, JSON.stringify(ast, null, 2));

      log.success(`AST written to ${outputPath}`);
      log.info(`  Files: ${ast.stats.totalFiles} (${ast.stats.totalLines} lines)`);
      log.info(`  Routes: ${ast.routes.length}`);
      log.info(`  Components: ${ast.components.length}`);
      log.info(`  Hooks: ${ast.hooks.length}`);
    });
}
```

**Step 2: Register in cli.ts**

Add to imports in `src/cli.ts`:
```ts
import { registerScan } from './commands/scan.ts';
```

Add before `program.parse()`:
```ts
registerScan(program);
```

**Step 3: Verify it builds**

```bash
bun build src/cli.ts src/index.ts src/config/schema.ts src/mcp.ts --outdir ./dist --target node --format esm --splitting
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/commands/scan.ts src/cli.ts
git commit -m "feat: add scan command for codebase AST scanning"
```

---

### Task 6: Add the `push` command

**Files:**
- Create: `src/scanner/push.ts`
- Create: `src/commands/push.ts`
- Modify: `src/cli.ts`

**Step 1: Create push client**

`src/scanner/push.ts`:
```ts
import type { QAMapV2Payload, PushResult } from './types.ts';

export async function pushToApi(
  payload: QAMapV2Payload,
  apiUrl: string,
  apiKey: string,
): Promise<PushResult> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Push failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<PushResult>;
}
```

**Step 2: Create push command**

`src/commands/push.ts`:
```ts
import type { Command } from 'commander';
import { join } from 'node:path';
import { resolveCommandContext } from './_shared.ts';
import { pushToApi } from '../scanner/push.ts';
import { readFile, fileExists } from '../utils/fs.ts';
import * as log from '../utils/logger.ts';
import { createSpinner } from '../utils/ui.ts';
import type { QAMapV2Payload } from '../scanner/types.ts';

export function registerPush(program: Command) {
  program
    .command('push [input]')
    .description('Push QA map to remote API')
    .option('--commit-sha <sha>', 'Git commit SHA to associate')
    .action(async (inputArg?: string, opts?: any) => {
      const ctx = await resolveCommandContext(program);

      const apiUrl = ctx.config.push?.apiUrl ?? process.env.E2E_AI_API_URL;
      const apiKey = ctx.config.push?.apiKey ?? process.env.E2E_AI_API_KEY;

      if (!apiUrl) {
        log.error('No push.apiUrl configured. Set it in e2e-ai.config.ts or E2E_AI_API_URL env var.');
        process.exit(1);
      }
      if (!apiKey) {
        log.error('No push.apiKey configured. Set it in e2e-ai.config.ts or E2E_AI_API_KEY env var.');
        process.exit(1);
      }

      // Resolve input file
      const root = ctx.paths.projectRoot;
      let inputPath: string;
      if (inputArg) {
        inputPath = join(root, inputArg);
      } else if (ctx.key) {
        inputPath = join(ctx.paths.workingDir, ctx.key, 'qa-map.json');
      } else {
        inputPath = join(root, '.e2e-ai', 'qa-map.json');
      }

      if (!fileExists(inputPath)) {
        log.error(`QA map not found: ${inputPath}`);
        process.exit(1);
      }

      const payload: QAMapV2Payload = JSON.parse(readFile(inputPath));
      if (opts?.commitSha) {
        payload.commitSha = opts.commitSha;
      }

      log.info(`Pushing: ${payload.features.length} features, ${payload.workflows.length} workflows, ${payload.scenarios.length} scenarios`);

      const spinner = createSpinner();
      spinner.start('Pushing to API...');
      const result = await pushToApi(payload, apiUrl, apiKey);
      spinner.stop();

      log.success('Push successful!');
      log.info(`  Version: ${result.version} (schema v${result.schemaVersion})`);
      log.info(`  Auto-linked scenarios: ${result.stats.autoLinkedScenarios}`);
    });
}
```

**Step 3: Register in cli.ts**

Add import and `registerPush(program)` in `src/cli.ts`.

**Step 4: Commit**

```bash
git add src/scanner/push.ts src/commands/push.ts src/cli.ts
git commit -m "feat: add push command for remote QA map upload"
```

---

### Task 7: Extend config schema with scanner + push sections

**Files:**
- Modify: `src/config/schema.ts`

**Step 1: Add scanner and push schemas**

Add before the main `E2eAiConfigSchema`:

```ts
const ScannerSchema = z.object({
  scanDir: z.string().default('src'),
  include: z.array(z.string()).default(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']),
  exclude: z.array(z.string()).default([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/*.d.ts',
  ]),
  cacheDir: z.string().default('.e2e-ai/scan-cache'),
});

const PushSchema = z.object({
  apiUrl: z.string().nullable().default(null),
  apiKey: z.string().nullable().default(null),
});
```

Add to `E2eAiConfigSchema`:
```ts
scanner: nested(ScannerSchema.shape),
push: nested(PushSchema.shape),
```

**Step 2: Add glob as explicit dependency**

```bash
bun add glob
```

**Step 3: Verify build**

```bash
bun run build
```

**Step 4: Commit**

```bash
git add src/config/schema.ts package.json bun.lockb
git commit -m "feat: add scanner and push config sections"
```

---

### Task 8: Create the feature-analyzer agent markdown

**Files:**
- Create: `agents/feature-analyzer-agent.md`

**Step 1: Write the agent**

```markdown
---
agent: feature-analyzer-agent
version: "1.0"
model: gpt-4o
max_tokens: 8192
temperature: 0.1
---

# System Prompt

You are a QA feature analyst. You receive an AST scan result (routes, components, hooks, dependencies) of a web application and identify the logical features, user-facing workflows, and reusable components.

Your job is to transform raw structural data into a high-level QA map that captures what the application does from a user's perspective.

## Input Schema

You receive a JSON object with:
- `ast`: object - The ASTScanResult from a codebase scan (files, routes, components, hooks, dependencies)
- `existingMap`: object (optional) - A previous QAMapV2 to update incrementally

## Output Schema

Respond with JSON only (no markdown fences, no extra text):

```json
{
  "features": [
    {
      "id": "feat:<kebab-case>",
      "name": "Human-readable feature name",
      "description": "What this feature does from user perspective",
      "routes": ["/path1", "/path2"],
      "workflowIds": ["wf:<kebab>"],
      "sourceFiles": ["src/path/file.ts"]
    }
  ],
  "workflows": [
    {
      "id": "wf:<kebab-case>",
      "name": "Human-readable workflow name",
      "featureId": "feat:<parent>",
      "type": "navigation|crud|multi-step|configuration|search-filter",
      "preconditions": ["User is authenticated"],
      "steps": [
        {
          "id": "step:<workflow>:<index>",
          "order": 1,
          "description": "What the user does",
          "componentIds": ["comp:<kebab>"],
          "apiCalls": ["POST /api/endpoint"],
          "conditionalBranches": []
        }
      ],
      "componentIds": ["comp:<kebab>"]
    }
  ],
  "components": [
    {
      "id": "comp:<kebab-case>",
      "name": "ComponentName",
      "type": "form|display|navigation|modal|layout|feedback",
      "sourceFiles": ["src/path/Component.tsx"],
      "props": ["prop1", "prop2"],
      "referencedByWorkflows": ["wf:<kebab>"]
    }
  ]
}
```

## Rules

1. Group routes and components into logical features based on shared URL paths, layouts, and data dependencies
2. A feature represents a user-facing capability (e.g., "User Management", "Dashboard", "Settings")
3. A workflow represents a specific user journey within a feature (e.g., "Create new user", "Filter dashboard by date")
4. Workflow type must be one of: navigation, crud, multi-step, configuration, search-filter
5. Identify components by their role: form (inputs), display (data rendering), navigation, modal, layout, feedback (toasts/alerts)
6. Link components to workflows based on which route/page uses them (infer from imports and hook usage)
7. API routes should be mapped as apiCalls within workflow steps
8. Dynamic routes (containing `[param]`) indicate CRUD or detail-view workflows
9. Prefer fewer, well-defined features over many granular ones. Aim for 3-15 features per app.
10. Output valid JSON only, no markdown code fences or surrounding text
```

**Step 2: Commit**

```bash
git add agents/feature-analyzer-agent.md
git commit -m "feat: add feature-analyzer agent for QA map generation"
```

---

### Task 9: Create the scenario-planner agent markdown

**Files:**
- Create: `agents/scenario-planner-agent.md`

**Step 1: Write the agent**

```markdown
---
agent: scenario-planner-agent
version: "1.0"
model: gpt-4o
max_tokens: 8192
temperature: 0.2
---

# System Prompt

You are a QA scenario planner. You receive a QA map (features, workflows, components) and generate test scenarios for each workflow. Scenarios cover happy paths, edge cases, validation, error handling, and permission checks.

Your output completes the QA map by adding the scenarios array, producing a full QAMapV2Payload ready for use.

## Input Schema

You receive a JSON object with:
- `features`: array - Feature definitions from feature-analyzer-agent
- `workflows`: array - Workflow definitions with steps
- `components`: array - Component definitions

## Output Schema

Respond with JSON only (no markdown fences, no extra text). Return the complete payload including the original features/workflows/components plus a new `scenarios` array:

```json
{
  "features": [...],
  "workflows": [...],
  "components": [...],
  "scenarios": [
    {
      "id": "sc:<workflow-id>:<index>",
      "workflowId": "wf:<kebab>",
      "featureId": "feat:<kebab>",
      "name": "Descriptive scenario name",
      "description": "What this scenario verifies",
      "category": "happy-path|permission|validation|error|edge-case|precondition",
      "preconditions": ["User is authenticated", "Data exists"],
      "steps": [
        {
          "order": 1,
          "action": "What the user does",
          "expectedResult": "What should happen"
        }
      ],
      "expectedOutcome": "Final expected state",
      "componentIds": ["comp:<kebab>"],
      "workflowStepIds": ["step:<workflow>:<index>"],
      "priority": "critical|high|medium|low"
    }
  ]
}
```

## Rules

1. Generate at least one happy-path scenario per workflow
2. For CRUD workflows: test create, read, update, delete + validation failures
3. For multi-step workflows: test complete flow + abandonment at each step
4. For forms: test validation (empty fields, invalid input, boundary values)
5. For workflows with conditionalBranches: generate one scenario per branch
6. Priority mapping: happy-path critical flows = critical, validation = high, edge-cases = medium, precondition checks = low
7. Each scenario should have 2-8 steps, each with a verifiable expectedResult
8. Scenario names should be descriptive: "[Feature]: [what is being tested]"
9. Link scenarios to workflow steps via workflowStepIds
10. Aim for 3-8 scenarios per workflow depending on complexity
11. Output valid JSON only, no markdown code fences or surrounding text
```

**Step 2: Commit**

```bash
git add agents/scenario-planner-agent.md
git commit -m "feat: add scenario-planner agent for test scenario generation"
```

---

### Task 10: Add the `analyze` command

**Files:**
- Create: `src/commands/analyze.ts`
- Modify: `src/cli.ts`

**Step 1: Create the analyze command**

`src/commands/analyze.ts`:
```ts
import type { Command } from 'commander';
import { join } from 'node:path';
import { resolveCommandContext } from './_shared.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { parseJsonResponse } from '../agents/parseResponse.ts';
import { readFile, writeFile, fileExists } from '../utils/fs.ts';
import * as log from '../utils/logger.ts';
import { createSpinner } from '../utils/ui.ts';

export function registerAnalyze(program: Command) {
  program
    .command('analyze [input]')
    .description('Analyze AST scan with AI to generate QA map (features, workflows, scenarios)')
    .option('--output <file>', 'Write QA map to specific file')
    .option('--skip-scenarios', 'Only run feature analysis (skip scenario generation)')
    .action(async (inputArg?: string, opts?: any) => {
      const ctx = await resolveCommandContext(program);
      const root = ctx.paths.projectRoot;

      // Resolve input AST file
      let inputPath: string;
      if (inputArg) {
        inputPath = join(root, inputArg);
      } else if (ctx.key) {
        inputPath = join(ctx.paths.workingDir, ctx.key, 'ast-scan.json');
      } else {
        inputPath = join(root, '.e2e-ai', 'ast-scan.json');
      }

      if (!fileExists(inputPath)) {
        log.error(`AST scan not found: ${inputPath}. Run "e2e-ai scan" first.`);
        process.exit(1);
      }

      const ast = JSON.parse(readFile(inputPath));

      // Stage 2: Feature analysis
      const spinner = createSpinner();
      spinner.start('Analyzing features and workflows...');
      const featureAgent = loadAgent('feature-analyzer-agent', ctx.config);
      const featureResponse = await callLLM({
        provider: ctx.provider,
        model: ctx.model ?? featureAgent.config.model,
        systemPrompt: featureAgent.systemPrompt,
        userMessage: JSON.stringify({ ast }),
        maxTokens: featureAgent.config.maxTokens,
        temperature: featureAgent.config.temperature,
        jsonMode: true,
      });
      spinner.stop();

      const qaMap = parseJsonResponse(featureResponse.content);
      if (!qaMap?.features) {
        log.error('Feature analysis failed: invalid response');
        process.exit(1);
      }

      log.success(`Identified ${qaMap.features.length} features, ${qaMap.workflows.length} workflows, ${qaMap.components.length} components`);

      // Stage 3: Scenario generation (unless skipped)
      let finalPayload = qaMap;
      if (!opts?.skipScenarios) {
        spinner.start('Generating test scenarios...');
        const scenarioAgent = loadAgent('scenario-planner-agent', ctx.config);
        const scenarioResponse = await callLLM({
          provider: ctx.provider,
          model: ctx.model ?? scenarioAgent.config.model,
          systemPrompt: scenarioAgent.systemPrompt,
          userMessage: JSON.stringify(qaMap),
          maxTokens: scenarioAgent.config.maxTokens,
          temperature: scenarioAgent.config.temperature,
          jsonMode: true,
        });
        spinner.stop();

        finalPayload = parseJsonResponse(scenarioResponse.content);
        if (!finalPayload?.scenarios) {
          log.warn('Scenario generation returned no scenarios, using feature map only');
          finalPayload = { ...qaMap, scenarios: [] };
        } else {
          log.success(`Generated ${finalPayload.scenarios.length} scenarios`);
        }
      } else {
        finalPayload = { ...qaMap, scenarios: [] };
      }

      // Write output
      const outputPath = opts?.output
        ?? (ctx.key
          ? join(ctx.paths.workingDir, ctx.key, 'qa-map.json')
          : join(root, '.e2e-ai', 'qa-map.json'));

      writeFile(outputPath, JSON.stringify(finalPayload, null, 2));
      log.success(`QA map written to ${outputPath}`);
    });
}
```

**Step 2: Register in cli.ts**

Add import and `registerAnalyze(program)` in `src/cli.ts`.

**Step 3: Check parseResponse has JSON extraction**

Read `src/agents/parseResponse.ts` to confirm `parseJsonResponse` exists. If it only has a generic `parseResponse`, add a small helper:

```ts
export function parseJsonResponse(content: string): any {
  // Try direct JSON parse first
  try {
    return JSON.parse(content);
  } catch {}

  // Extract from markdown fence
  const fenceMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {}
  }

  return null;
}
```

**Step 4: Verify build**

```bash
bun run build
```

**Step 5: Commit**

```bash
git add src/commands/analyze.ts src/cli.ts src/agents/parseResponse.ts
git commit -m "feat: add analyze command for AI-driven QA map generation"
```

---

### Task 11: Verify all three commands work end-to-end

**Step 1: Test scan command**

```bash
bun run src/cli.ts scan --help
```
Expected: shows scan description and options.

```bash
bun run src/cli.ts scan --scan-dir src
```
Expected: scans own codebase, writes `.e2e-ai/ast-scan.json`.

**Step 2: Test analyze command**

```bash
bun run src/cli.ts analyze --help
```
Expected: shows analyze description and options.

**Step 3: Test push command**

```bash
bun run src/cli.ts push --help
```
Expected: shows push description and options.

**Step 4: Test build output**

```bash
bun run build && node dist/cli.js scan --help
```
Expected: works from compiled output.

**Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve build and runtime issues for scanner commands"
```

---

### Task 12: Delete scanner from qa-intelligence

**Files (in qa-intelligence repo):**
- Delete: `packages/scanner/` (entire directory)
- Delete: `packages/shared/` (entire directory)
- Modify: `package.json` (remove scanner scripts)

**Step 1: Delete packages**

```bash
cd /Users/davideghiotto/Desktop/projects/qa-intelligence
rm -rf packages/scanner packages/shared
```

**Step 2: Remove scanner scripts from root package.json**

Remove the `"build:scanner"` script from `package.json`.

**Step 3: Check if workspaces still resolves**

The `"workspaces": ["packages/*"]` glob will just match `packages/web/` now. No change needed.

**Step 4: Install to update lockfile**

```bash
bun install
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove scanner and shared packages (moved to e2e-ai)"
```

---

### Task 13: Export scanner types from e2e-ai package

**Files:**
- Modify: `src/index.ts`

**Step 1: Add type exports**

Add to `src/index.ts`:
```ts
export type {
  ASTScanResult,
  FileNode,
  ImportInfo,
  RouteNode,
  ComponentNode,
  HookNode,
  DependencyEdge,
  QAMapV2Payload,
  FeatureV2,
  WorkflowV2,
  ScenarioV2,
  ComponentV2,
  PushResult,
} from './scanner/types.ts';
```

**Step 2: Rebuild**

```bash
bun run build
```

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: export scanner types from package"
```
