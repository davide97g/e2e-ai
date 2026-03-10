import type { LanguageParser, ParseResult } from './base.ts';
import type {
  FileNode,
  ImportInfo,
  ComponentNode,
  HookNode,
  DependencyEdge,
} from '../types.ts';

/**
 * TypeScript/TSX parser using regex-based extraction.
 * Fast, zero-dependency approach for MVP. Can be replaced with tree-sitter later.
 */
export class TypeScriptParser implements LanguageParser {
  extensions = ['.ts', '.tsx', '.js', '.jsx'];

  async parse(filePath: string, content: string): Promise<ParseResult> {
    const lines = content.split('\n');
    const imports = this.extractImports(content);
    const exports = this.extractExports(content);
    const components = this.extractComponents(filePath, content);
    const hooks = this.extractHooks(filePath, content);

    const file: FileNode = {
      path: filePath,
      language: filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'typescript',
      lines: lines.length,
      exports,
      imports,
    };

    const dependencies: DependencyEdge[] = imports.map((imp) => ({
      from: filePath,
      to: imp.source,
      specifiers: imp.specifiers,
    }));

    return {
      file,
      routes: [], // Routes extracted separately by route extractor
      components,
      hooks,
      dependencies,
    };
  }

  private extractImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // import X from "source"
    // import { X, Y } from "source"
    // import * as X from "source"
    // import "source"
    const importRegex = /^import\s+(?:(?:(\w+)|(\{[^}]+\})|\*\s+as\s+(\w+))\s+from\s+)?["']([^"']+)["']/gm;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const defaultImport = match[1];
      const namedImports = match[2];
      const namespaceImport = match[3];
      const source = match[4];

      const specifiers: string[] = [];
      let isDefault = false;

      if (defaultImport) {
        specifiers.push(defaultImport);
        isDefault = true;
      }
      if (namedImports) {
        const names = namedImports
          .replace(/[{}]/g, '')
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        specifiers.push(...names);
      }
      if (namespaceImport) {
        specifiers.push(`* as ${namespaceImport}`);
      }

      imports.push({ source, specifiers, isDefault });
    }

    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // export function/const/class/type/interface NAME
    const namedExportRegex = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // export default
    if (/^export\s+default\s+/m.test(content)) {
      if (!exports.includes('default')) {
        exports.push('default');
      }
    }

    // export { X, Y }
    const reExportRegex = /^export\s+\{([^}]+)\}/gm;
    while ((match = reExportRegex.exec(content)) !== null) {
      const names = match[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/).pop()?.trim())
        .filter((s): s is string => !!s);
      exports.push(...names);
    }

    return [...new Set(exports)];
  }

  private extractComponents(filePath: string, content: string): ComponentNode[] {
    const components: ComponentNode[] = [];
    const isTSX = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

    if (!isTSX && !content.includes('React.createElement')) return components;

    // Function components: export function ComponentName(props) or export const ComponentName = (props) =>
    // Detect by: PascalCase name + returns JSX
    const funcComponentRegex = /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Z]\w+)\s*\(([^)]*)\)/g;
    const arrowComponentRegex = /(?:export\s+(?:default\s+)?)?(?:const|let)\s+([A-Z]\w+)\s*(?::\s*\w+(?:<[^>]+>)?\s*)?=\s*(?:\([^)]*\)|(\w+))\s*(?::\s*\w+(?:<[^>]+>)?\s*)?=>/g;

    let match: RegExpExecArray | null;

    while ((match = funcComponentRegex.exec(content)) !== null) {
      const name = match[1];
      const paramsStr = match[2];
      components.push({
        name,
        filePath,
        props: this.extractPropsFromParams(paramsStr, content),
        isExported: content.includes('export') && content.substring(Math.max(0, match.index - 30), match.index + match[0].length).includes('export'),
        hasJSX: true,
        hookCalls: this.extractHookCalls(content, match.index),
      });
    }

    while ((match = arrowComponentRegex.exec(content)) !== null) {
      const name = match[1];
      components.push({
        name,
        filePath,
        props: this.extractPropsFromContext(name, content),
        isExported: content.substring(Math.max(0, match.index - 20), match.index + match[0].length).includes('export'),
        hasJSX: true,
        hookCalls: this.extractHookCalls(content, match.index),
      });
    }

    return components;
  }

  private extractPropsFromParams(paramsStr: string, _content: string): string[] {
    if (!paramsStr.trim()) return [];

    // Destructured props: { prop1, prop2, prop3 }
    const destructured = paramsStr.match(/\{\s*([^}]+)\s*\}/);
    if (destructured) {
      return destructured[1]
        .split(',')
        .map((p) => p.trim().split(/[=:]/)[0].trim())
        .filter(Boolean);
    }

    // Type annotation: props: PropsType
    const typed = paramsStr.match(/(\w+)\s*:\s*(\w+)/);
    if (typed) {
      return [typed[1]];
    }

    return [];
  }

  private extractPropsFromContext(componentName: string, content: string): string[] {
    // Look for interface/type ComponentNameProps
    const propsTypeRegex = new RegExp(
      `(?:interface|type)\\s+${componentName}Props\\s*(?:=\\s*)?\\{([^}]+)\\}`,
    );
    const match = content.match(propsTypeRegex);
    if (match) {
      return match[1]
        .split(/[;\n]/)
        .map((line) => line.trim().split(/[?:]/)[0].trim())
        .filter(Boolean);
    }
    return [];
  }

  private extractHookCalls(content: string, startIndex: number): string[] {
    // Find the function body and extract use* calls
    const hookCalls: string[] = [];
    const bodyStart = content.indexOf('{', startIndex);
    if (bodyStart === -1) return hookCalls;

    // Simple brace matching to find function body
    let depth = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }

    const body = content.substring(bodyStart, bodyEnd);
    const hookRegex = /\b(use\w+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = hookRegex.exec(body)) !== null) {
      if (!hookCalls.includes(match[1])) {
        hookCalls.push(match[1]);
      }
    }

    return hookCalls;
  }

  private extractHooks(filePath: string, content: string): HookNode[] {
    const hooks: HookNode[] = [];

    // Custom hook definitions: export function useXxx or export const useXxx
    const hookDefRegex = /(?:export\s+)?(?:function|const)\s+(use[A-Z]\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = hookDefRegex.exec(content)) !== null) {
      const name = match[1];
      const bodyStart = content.indexOf('{', match.index);
      if (bodyStart === -1) continue;

      // Extract dependencies (other hooks called within)
      const deps: string[] = [];
      let depth = 0;
      let bodyEnd = bodyStart;
      for (let i = bodyStart; i < content.length; i++) {
        if (content[i] === '{') depth++;
        if (content[i] === '}') depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }

      const body = content.substring(bodyStart, bodyEnd);
      const depRegex = /\b(use\w+)\s*\(/g;
      let depMatch: RegExpExecArray | null;
      while ((depMatch = depRegex.exec(body)) !== null) {
        if (depMatch[1] !== name && !deps.includes(depMatch[1])) {
          deps.push(depMatch[1]);
        }
      }

      hooks.push({
        name,
        filePath,
        isCustom: true,
        dependencies: deps,
      });
    }

    return hooks;
  }
}
