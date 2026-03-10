#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { loadAgent } from './agents/loadAgent.ts';
import { getPackageRoot } from './config/loader.ts';
import { scanCodebase } from './utils/scan.ts';
import { validateContext } from './utils/validateContext.ts';

// ---------------------------------------------------------------------------
// Server instructions — injected into the AI assistant's system prompt
// ---------------------------------------------------------------------------

const SERVER_INSTRUCTIONS = `
# e2e-ai — Orchestration Guide

You have access to e2e-ai, an AI-powered E2E test automation tool. Follow this protocol when the user asks you to perform any e2e-ai automation.

## Core Principle: Plan → Approve → Execute Step-by-Step

NEVER run multiple pipeline steps at once. Each step is a separate job with its own context.

## Protocol

1. **Plan first.** Call \`e2e_ai_plan_workflow\` with the user's goal. This returns a structured todo list of steps.
2. **Present the plan.** Show the user the ordered step list with descriptions. Ask for confirmation or adjustments before proceeding.
3. **Execute one step at a time.** For each step in the approved plan:
   a. Tell the user which step you're about to run and why.
   b. Call \`e2e_ai_execute_step\` with the step name and parameters.
   c. Report the result to the user (success, key output, any warnings).
   d. If the step fails, stop and discuss with the user before continuing.
   e. Move to the next step only after the current one succeeds.
4. **Use subagents when available.** If your AI platform supports subagents (e.g., Claude Code Agent tool), dispatch each step as a dedicated subagent to preserve context. Each subagent should:
   - Receive only the context it needs (step name, key, relevant file paths)
   - Call \`e2e_ai_execute_step\` to do its work
   - Return the result to the orchestrator

## Step Dependencies

Steps produce artifacts that feed into later steps. The pipeline handles this automatically — each step picks up where the previous one left off. Do not skip steps unless the plan says a step can be skipped.

## Interactive Steps

The \`record\` step opens a browser and requires user interaction. When the plan includes \`record\`:
- Tell the user they need to interact with the browser window
- The step will block until they close the codegen window
- After recording completes, proceed with the next step

## When Things Fail

- If \`test\` fails and \`heal\` is in the plan, that's expected — heal will attempt to fix it
- If \`heal\` exhausts all retries, stop and show the user the last error output
- For any other failure, stop and ask the user how to proceed

## Available Workflows

- **Full test pipeline**: record → transcribe → scenario → generate → refine → test → heal → qa
- **From existing recording**: transcribe → scenario → generate → refine → test → heal → qa
- **AI-only (no recording)**: scenario → generate → refine → test → heal → qa
- **Generate from scenario**: generate → refine → test → heal → qa
- **Test + heal loop**: test → heal
- **Scanner pipeline**: scan → analyze → push
- **Single step**: any individual command

Always use \`e2e_ai_plan_workflow\` to determine the right steps — don't guess.
`.trim();

// ---------------------------------------------------------------------------
// Step definitions for the planner
// ---------------------------------------------------------------------------

interface StepDef {
  name: string;
  description: string;
  produces: string;
  requires: string;
  interactive: boolean;
  canSkip?: string;
}

const TEST_PIPELINE_STEPS: StepDef[] = [
  {
    name: 'record',
    description: 'Launch Playwright codegen in the browser. Optionally records voice narration for richer test scenarios.',
    produces: 'codegen .ts file + optional .wav voice recording',
    requires: 'none',
    interactive: true,
  },
  {
    name: 'transcribe',
    description: 'Transcribe the voice recording via OpenAI Whisper. Merges timestamped voice comments into the codegen file.',
    produces: 'transcript JSON + annotated codegen file',
    requires: 'voice recording from record step',
    interactive: false,
    canSkip: 'No voice recording exists or voice is disabled',
  },
  {
    name: 'scenario',
    description: 'AI analyzes the codegen + transcript and generates a structured YAML test scenario with semantic steps and expected results.',
    produces: 'YAML test scenario file',
    requires: 'codegen file (+ optional transcript)',
    interactive: false,
  },
  {
    name: 'generate',
    description: 'AI converts the YAML scenario into a complete Playwright .test.ts file using project conventions from context.md.',
    produces: 'Playwright .test.ts file',
    requires: 'YAML scenario file',
    interactive: false,
  },
  {
    name: 'refine',
    description: 'AI refactors the test: replaces raw selectors with semantic alternatives, adds proper timeouts, uses project helpers.',
    produces: 'improved .test.ts file (in-place)',
    requires: 'Playwright .test.ts file',
    interactive: false,
  },
  {
    name: 'test',
    description: 'Run the Playwright test with trace/video/screenshot capture. Reports pass/fail status.',
    produces: 'test results + trace files',
    requires: 'Playwright .test.ts file',
    interactive: false,
  },
  {
    name: 'heal',
    description: 'If the test failed, AI diagnoses the failure and patches the test. Retries up to 3 times with different strategies.',
    produces: 'patched .test.ts file (if test was failing)',
    requires: 'failing test + error output',
    interactive: false,
    canSkip: 'Test already passes',
  },
  {
    name: 'qa',
    description: 'Generate formal QA documentation: markdown test case with preconditions, steps table, and optional Zephyr XML export.',
    produces: 'QA markdown + optional Zephyr XML',
    requires: 'Playwright .test.ts file + scenario',
    interactive: false,
  },
];

const SCANNER_PIPELINE_STEPS: StepDef[] = [
  {
    name: 'scan',
    description: 'Scan the codebase AST: extract routes, components, hooks, imports, and dependency graph.',
    produces: 'ast-scan.json with full codebase structure',
    requires: 'none',
    interactive: false,
  },
  {
    name: 'analyze',
    description: 'AI analyzes the AST scan to identify features, workflows, components, and generate test scenarios.',
    produces: 'qa-map.json with features, workflows, scenarios',
    requires: 'ast-scan.json from scan step',
    interactive: false,
  },
  {
    name: 'push',
    description: 'Push the QA map to a remote API endpoint for integration with external tools.',
    produces: 'push confirmation with version info',
    requires: 'qa-map.json from analyze step + API config',
    interactive: false,
  },
];

const ALL_STEPS = [...TEST_PIPELINE_STEPS, ...SCANNER_PIPELINE_STEPS];

// ---------------------------------------------------------------------------
// Planner logic
// ---------------------------------------------------------------------------

interface PlannedStep {
  order: number;
  name: string;
  description: string;
  command: string;
  produces: string;
  interactive: boolean;
  canSkip?: string;
}

interface WorkflowPlan {
  goal: string;
  pipeline: 'test' | 'scanner' | 'single';
  steps: PlannedStep[];
  notes: string[];
}

function planWorkflow(goal: string, options: {
  key?: string;
  from?: string;
  skip?: string[];
  voice?: boolean;
  trace?: boolean;
  scanDir?: string;
}): WorkflowPlan {
  const goalLower = goal.toLowerCase();
  const notes: string[] = [];

  // Detect which pipeline
  const isScannerGoal = /\b(scan|analyze|qa.?map|feature.?analy|push.?qa|codebase.?scan)\b/.test(goalLower);
  const isSingleStep = ALL_STEPS.some(s => goalLower === s.name || goalLower === `run ${s.name}`);

  let stepDefs: StepDef[];

  if (isScannerGoal && !isSingleStep) {
    stepDefs = [...SCANNER_PIPELINE_STEPS];

    // If goal doesn't mention push, exclude it
    if (!/\bpush\b/.test(goalLower)) {
      stepDefs = stepDefs.filter(s => s.name !== 'push');
      notes.push('Push step excluded — add it if you want to upload the QA map to a remote API.');
    }
  } else if (isSingleStep) {
    const stepName = ALL_STEPS.find(s => goalLower.includes(s.name))!.name;
    stepDefs = ALL_STEPS.filter(s => s.name === stepName);
  } else {
    // Default: test pipeline
    stepDefs = [...TEST_PIPELINE_STEPS];

    // Apply --from
    if (options.from) {
      const fromIdx = stepDefs.findIndex(s => s.name === options.from);
      if (fromIdx > 0) {
        const skipped = stepDefs.slice(0, fromIdx).map(s => s.name);
        stepDefs = stepDefs.slice(fromIdx);
        notes.push(`Starting from "${options.from}" — skipping: ${skipped.join(', ')}`);
      }
    } else {
      // Detect intent-based from
      if (/\b(from recording|existing recording|already recorded)\b/.test(goalLower)) {
        stepDefs = stepDefs.filter(s => s.name !== 'record');
        notes.push('Skipping record — using existing recording files.');
      }
      if (/\b(from scenario|existing scenario|manual scenario|yaml)\b/.test(goalLower)) {
        stepDefs = stepDefs.filter(s => !['record', 'transcribe', 'scenario'].includes(s.name));
        notes.push('Starting from generate — using existing scenario YAML.');
      }
      if (/\b(generate.?only|just.?generate|no.?record)\b/.test(goalLower)) {
        stepDefs = stepDefs.filter(s => !['record', 'transcribe'].includes(s.name));
      }
      if (/\b(test.?and.?heal|test.?heal|heal.?loop|fix.?test|self.?heal)\b/.test(goalLower)) {
        stepDefs = stepDefs.filter(s => ['test', 'heal'].includes(s.name));
      }
      if (/\b(refine|refactor)\b/.test(goalLower) && !/\brun\b/.test(goalLower)) {
        stepDefs = stepDefs.filter(s => s.name === 'refine');
      }
      if (/\bqa\b/.test(goalLower) && /\b(doc|only|generate)\b/.test(goalLower)) {
        stepDefs = stepDefs.filter(s => s.name === 'qa');
      }
    }
  }

  // Apply skip
  if (options.skip?.length) {
    stepDefs = stepDefs.filter(s => !options.skip!.includes(s.name));
    notes.push(`Skipping: ${options.skip.join(', ')}`);
  }

  // Voice handling
  if (options.voice === false) {
    stepDefs = stepDefs.filter(s => s.name !== 'transcribe');
    notes.push('Voice disabled — transcribe step removed.');
  }

  // Build CLI commands
  const cliBase = 'e2e-ai';
  const steps: PlannedStep[] = stepDefs.map((s, i) => {
    const args: string[] = [s.name];

    if (options.key && !['scan', 'analyze', 'push'].includes(s.name)) {
      args.push('--key', options.key);
    }
    if (s.name === 'record') {
      if (options.voice === false) args.push('--no-voice');
      if (options.trace === false) args.push('--no-trace');
    }
    if (s.name === 'scan' && options.scanDir) {
      args.push('--scan-dir', options.scanDir);
    }

    return {
      order: i + 1,
      name: s.name,
      description: s.description,
      command: `${cliBase} ${args.join(' ')}`,
      produces: s.produces,
      interactive: s.interactive,
      canSkip: s.canSkip,
    };
  });

  const pipeline = isScannerGoal ? 'scanner' : isSingleStep ? 'single' : 'test';

  if (!options.key && pipeline === 'test' && steps.length > 1) {
    notes.push('No --key provided. Use --key <ISSUE-KEY> to organize files by issue.');
  }

  return { goal, pipeline, steps, notes };
}

// ---------------------------------------------------------------------------
// Step executor
// ---------------------------------------------------------------------------

function executeStep(
  stepName: string,
  options: {
    key?: string;
    voice?: boolean;
    trace?: boolean;
    scanDir?: string;
    output?: string;
    extraArgs?: string[];
  },
): { success: boolean; output: string; command: string } {
  const args: string[] = [stepName];

  if (options.key && !['scan', 'analyze', 'push'].includes(stepName)) {
    args.push('--key', options.key);
  }
  if (stepName === 'record') {
    if (options.voice === false) args.push('--no-voice');
    if (options.trace === false) args.push('--no-trace');
  }
  if (stepName === 'scan' && options.scanDir) {
    args.push('--scan-dir', options.scanDir);
  }
  if (options.output) {
    args.push('--output', options.output);
  }
  if (options.extraArgs?.length) {
    args.push(...options.extraArgs);
  }

  // Resolve the CLI binary path
  const pkgRoot = getPackageRoot();
  const cliBin = join(pkgRoot, 'dist', 'cli.js');
  const command = `node ${cliBin} ${args.join(' ')}`;

  try {
    const stdout = execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 300_000, // 5 min per step
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: stdout, command };
  } catch (err: any) {
    const stderr = err.stderr?.toString() ?? '';
    const stdout = err.stdout?.toString() ?? '';
    return {
      success: false,
      output: `EXIT CODE: ${err.status ?? 'unknown'}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`,
      command,
    };
  }
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: 'e2e-ai', version: '1.2.0' },
  { instructions: SERVER_INSTRUCTIONS },
);

// --- Existing tools ---

server.registerTool(
  'e2e_ai_scan_codebase',
  {
    title: 'Scan Codebase',
    description: 'Scan a project directory for test files, configs, fixtures, path aliases, and sample test content. Use this during project setup or to understand test infrastructure.',
    inputSchema: z.object({
      projectRoot: z.string().optional().describe('Project root directory (defaults to cwd)'),
    }),
  },
  async ({ projectRoot }) => {
    const root = projectRoot || process.cwd();
    const scan = await scanCodebase(root);
    return {
      content: [{ type: 'text', text: JSON.stringify(scan, null, 2) }],
    };
  },
);

server.registerTool(
  'e2e_ai_validate_context',
  {
    title: 'Validate Context',
    description: 'Validate that a context markdown file contains all required sections (Application, Test Infrastructure, Feature Methods, Import Conventions, Selector Conventions, Test Structure Template, Utility Patterns).',
    inputSchema: z.object({
      content: z.string().describe('The markdown content of the context file to validate'),
    }),
  },
  async ({ content }) => {
    const result = validateContext(content);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  'e2e_ai_read_agent',
  {
    title: 'Read Agent',
    description: 'Read an agent prompt definition by name. Returns the agent system prompt and config. Agents: transcript-agent, scenario-agent, playwright-generator-agent, refactor-agent, self-healing-agent, qa-testcase-agent, feature-analyzer-agent, scenario-planner-agent, init-agent.',
    inputSchema: z.object({
      agentName: z.string().describe('Agent name (e.g. scenario-agent, playwright-generator-agent)'),
    }),
  },
  async ({ agentName }) => {
    try {
      const agent = loadAgent(agentName);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: agent.name,
            systemPrompt: agent.systemPrompt,
            config: agent.config,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'e2e_ai_get_example',
  {
    title: 'Get Example Context',
    description: 'Returns the full example context markdown file that shows the expected format for .e2e-ai/context.md.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const examplePath = join(getPackageRoot(), 'templates', 'e2e-ai.context.example.md');
      const content = readFileSync(examplePath, 'utf-8');
      return {
        content: [{ type: 'text', text: content }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

// --- New orchestration tools ---

server.registerTool(
  'e2e_ai_plan_workflow',
  {
    title: 'Plan Workflow',
    description:
      'Plan an e2e-ai automation workflow. Call this FIRST when the user asks to run any automation. ' +
      'Returns an ordered list of steps (todo list) that should be executed one at a time. ' +
      'Present the plan to the user for approval before executing any step.',
    inputSchema: z.object({
      goal: z.string().describe(
        'What the user wants to achieve. Examples: "run full pipeline for PROJ-101", ' +
        '"generate test from existing recording", "scan codebase and analyze features", ' +
        '"heal failing test PROJ-101", "refactor test PROJ-101"'
      ),
      key: z.string().optional().describe('Issue key (e.g. PROJ-101, LIN-42)'),
      from: z.string().optional().describe('Start from a specific step (skip all prior steps)'),
      skip: z.array(z.string()).optional().describe('Steps to skip (e.g. ["transcribe", "heal"])'),
      voice: z.boolean().optional().describe('Enable voice recording (default: true)'),
      trace: z.boolean().optional().describe('Enable trace capture (default: true)'),
      scanDir: z.string().optional().describe('Directory to scan (for scanner pipeline)'),
    }),
  },
  async ({ goal, key, from, skip, voice, trace, scanDir }) => {
    const plan = planWorkflow(goal, { key, from, skip, voice, trace, scanDir });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(plan, null, 2),
      }],
    };
  },
);

server.registerTool(
  'e2e_ai_execute_step',
  {
    title: 'Execute Pipeline Step',
    description:
      'Execute a single e2e-ai pipeline step. Call this ONE STEP AT A TIME from an approved plan. ' +
      'Each step produces artifacts consumed by later steps. ' +
      'If your AI platform supports subagents, run each step in a dedicated subagent to preserve context. ' +
      'The "record" step is interactive and will open a browser window — the user must interact with it.',
    inputSchema: z.object({
      step: z.string().describe(
        'Step name: record, transcribe, scenario, generate, refine, test, heal, qa, scan, analyze, push'
      ),
      key: z.string().optional().describe('Issue key (e.g. PROJ-101)'),
      voice: z.boolean().optional().describe('Enable voice recording (record step only)'),
      trace: z.boolean().optional().describe('Enable trace capture (record step only)'),
      scanDir: z.string().optional().describe('Directory to scan (scan step only)'),
      output: z.string().optional().describe('Custom output path (scan/analyze steps)'),
      extraArgs: z.array(z.string()).optional().describe('Additional CLI arguments'),
    }),
  },
  async ({ step, key, voice, trace, scanDir, output, extraArgs }) => {
    const validSteps = ALL_STEPS.map(s => s.name);
    if (!validSteps.includes(step)) {
      return {
        content: [{
          type: 'text',
          text: `Error: Unknown step "${step}". Valid steps: ${validSteps.join(', ')}`,
        }],
        isError: true,
      };
    }

    const result = executeStep(step, { key, voice, trace, scanDir, output, extraArgs });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          step,
          success: result.success,
          command: result.command,
          output: result.output,
        }, null, 2),
      }],
    };
  },
);

server.registerTool(
  'e2e_ai_get_workflow_guide',
  {
    title: 'Get Workflow Guide',
    description: 'Returns the e2e-ai workflow guide explaining how the pipeline works, step by step. Useful for understanding what each step does and how they connect.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const guidePath = join(getPackageRoot(), 'templates', 'workflow.md');
      if (!existsSync(guidePath)) {
        return {
          content: [{ type: 'text', text: 'Error: workflow.md not found in templates' }],
          isError: true,
        };
      }
      const content = readFileSync(guidePath, 'utf-8');
      return {
        content: [{ type: 'text', text: content }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('e2e-ai MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
