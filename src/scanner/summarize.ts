import { dirname } from 'node:path';
import type { ASTScanResult, ASTSummary } from './types.ts';

/**
 * Produce a compact summary from a full AST scan result.
 */
export function summarizeAST(ast: ASTScanResult, savedPath: string): ASTSummary {
  // Build directory groups: count files per top-level directory
  const dirGroups: Record<string, number> = {};
  for (const f of ast.files) {
    const dir = dirname(f.path).split('/')[0] || '.';
    dirGroups[dir] = (dirGroups[dir] ?? 0) + 1;
  }

  return {
    stats: ast.stats,
    routes: ast.routes.map((r) => ({
      path: r.path,
      filePath: r.filePath,
      isDynamic: r.isDynamic,
    })),
    fileTree: ast.files.map((f) => f.path),
    componentNames: ast.components.map((c) => c.name),
    hookNames: ast.hooks.filter((h) => h.isCustom).map((h) => h.name),
    directoryGroups: dirGroups,
    astScanPath: savedPath,
  };
}

/**
 * Return a filtered slice of the AST by category.
 */
export function filterASTByCategory(
  ast: ASTScanResult,
  category: 'routes' | 'components' | 'hooks' | 'dependencies' | 'files',
  filter?: string,
  limit?: number,
): object {
  const matchesFilter = (path: string): boolean => {
    if (!filter) return true;
    // Simple glob-like matching: * matches anything within a segment, ** matches across segments
    const regex = new RegExp(
      '^' +
        filter
          .replace(/\*\*/g, '__.DOUBLE__')
          .replace(/\*/g, '[^/]*')
          .replace(/__.DOUBLE__/g, '.*') +
        '$',
    );
    return regex.test(path);
  };

  let items: unknown[];

  switch (category) {
    case 'routes':
      items = filter
        ? ast.routes.filter((r) => matchesFilter(r.path) || matchesFilter(r.filePath))
        : ast.routes;
      break;
    case 'components':
      items = filter
        ? ast.components.filter((c) => matchesFilter(c.filePath) || matchesFilter(c.name))
        : ast.components;
      break;
    case 'hooks':
      items = filter
        ? ast.hooks.filter((h) => matchesFilter(h.filePath) || matchesFilter(h.name))
        : ast.hooks;
      break;
    case 'dependencies':
      items = filter
        ? ast.dependencies.filter((d) => matchesFilter(d.from) || matchesFilter(d.to))
        : ast.dependencies;
      break;
    case 'files':
      items = filter ? ast.files.filter((f) => matchesFilter(f.path)) : ast.files;
      break;
  }

  if (limit && limit > 0) {
    items = items.slice(0, limit);
  }

  return {
    category,
    filter: filter ?? null,
    total: items.length,
    items,
  };
}
