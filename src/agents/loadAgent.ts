import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getPackageRoot, getProjectRoot } from '../config/loader.ts';
import type { ResolvedConfig } from '../config/schema.ts';
import type { AgentPrompt, AgentConfig } from './types.ts';

/**
 * Load an agent prompt with optional two-part composition:
 * 1. Generic prompt from the package's agents/ directory
 * 2. Project context from the user's e2e-ai.context.md (if exists)
 *
 * When `config` is provided, per-agent model overrides are applied.
 */
export function loadAgent(agentName: string, config?: ResolvedConfig): AgentPrompt {
  const agentDir = join(getPackageRoot(), 'agents');
  const filePath = join(agentDir, `${agentName}.md`);

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(`Agent file not found: ${filePath}`);
  }

  const { frontmatter, body } = parseFrontmatter(content);
  const agentConfig = extractConfig(frontmatter);

  // Two-part composition: append project context if available
  let systemPrompt = body;
  if (config) {
    const contextPath = join(getProjectRoot(), config.contextFile);
    if (existsSync(contextPath)) {
      const projectContext = readFileSync(contextPath, 'utf-8').trim();
      if (projectContext) {
        systemPrompt = `${body}\n\n## Project Context\n\n${projectContext}`;
      }
    }

    // Per-agent model override from config
    if (config.llm.agentModels[agentName]) {
      agentConfig.model = config.llm.agentModels[agentName];
    }
  }

  const sections = parseSections(body);

  return {
    name: frontmatter.agent ?? agentName,
    systemPrompt,
    inputSchema: sections['Input Schema'],
    outputSchema: sections['Output Schema'],
    rules: sections['Rules'],
    example: sections['Example'],
    config: agentConfig,
  };
}

function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: any = line.slice(colonIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value === 'true') value = true;
    if (value === 'false') value = false;
    if (!isNaN(Number(value)) && value !== '') value = Number(value);
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

function extractConfig(frontmatter: Record<string, any>): AgentConfig {
  return {
    model: frontmatter.model,
    maxTokens: frontmatter.max_tokens ?? 4096,
    temperature: frontmatter.temperature ?? 0.2,
  };
}

function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = /^##\s+(.+)$/gm;
  const headings: Array<{ title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(body)) !== null) {
    headings.push({ title: match[1].trim(), index: match.index });
  }

  const systemMatch = body.match(/^#\s+System Prompt\n([\s\S]*?)(?=\n##\s|$)/m);
  if (systemMatch) {
    sections['System Prompt'] = systemMatch[1].trim();
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index + body.slice(headings[i].index).indexOf('\n') + 1;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    sections[headings[i].title] = body.slice(start, end).trim();
  }

  return sections;
}
