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
