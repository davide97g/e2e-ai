#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanCodebase } from './utils/scan.ts';
import { validateContext } from './utils/validateContext.ts';
import { loadAgent } from './agents/loadAgent.ts';
import { getPackageRoot } from './config/loader.ts';

const server = new McpServer({
  name: 'e2e-ai',
  version: '1.1.2',
});

server.registerTool(
  'e2e_ai_scan_codebase',
  {
    title: 'Scan Codebase',
    description: 'Scan a project directory for test files, configs, fixtures, path aliases, and sample test content',
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
    description: 'Validate that a context markdown file contains all required sections',
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
    description: 'Read an agent prompt definition by name. Returns the agent name, system prompt, and config (model, max_tokens, temperature).',
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
    description: 'Returns the full example context markdown file that shows the expected format for .e2e-ai/context.md',
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('e2e-ai MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
