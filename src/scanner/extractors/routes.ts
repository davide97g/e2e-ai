import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import type { RouteNode } from '../types.ts';

/**
 * Extract routes from a Next.js App Router or Pages Router project,
 * plus React Router JSX patterns.
 */
export function extractRoutes(scanDir: string): RouteNode[] {
  const routes: RouteNode[] = [];

  // Try App Router first (src/app or app directory)
  const appDirs = ['app', 'src/app'].map((d) => join(scanDir, d));
  for (const appDir of appDirs) {
    try {
      if (statSync(appDir).isDirectory()) {
        extractAppRouterRoutes(appDir, appDir, routes);
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // Try Pages Router (src/pages or pages directory)
  const pagesDirs = ['pages', 'src/pages'].map((d) => join(scanDir, d));
  for (const pagesDir of pagesDirs) {
    try {
      if (statSync(pagesDir).isDirectory()) {
        extractPagesRouterRoutes(pagesDir, pagesDir, routes);
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return routes;
}

function extractAppRouterRoutes(
  dir: string,
  baseDir: string,
  routes: RouteNode[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip route groups starting with ( but keep them for layout resolution
      extractAppRouterRoutes(fullPath, baseDir, routes);
      continue;
    }

    const name = basename(entry.name, entry.name.substring(entry.name.indexOf('.')));
    const ext = entry.name.substring(entry.name.indexOf('.'));

    if (!['.ts', '.tsx', '.js', '.jsx'].some((e) => entry.name.endsWith(e))) continue;

    // page.tsx → route
    if (name === 'page') {
      const routePath = dirToRoutePath(relative(baseDir, dir));
      const layoutFile = findLayoutFile(dir, baseDir);
      routes.push({
        path: routePath,
        filePath: relative(process.cwd(), fullPath),
        isDynamic: routePath.includes('['),
        layoutFile: layoutFile ? relative(process.cwd(), layoutFile) : undefined,
      });
    }

    // route.tsx → API route
    if (name === 'route') {
      const routePath = dirToRoutePath(relative(baseDir, dir));
      const methods = extractApiMethods(fullPath);
      for (const method of methods) {
        routes.push({
          path: routePath,
          filePath: relative(process.cwd(), fullPath),
          method,
          isDynamic: routePath.includes('['),
        });
      }
    }
  }
}

function extractPagesRouterRoutes(
  dir: string,
  baseDir: string,
  routes: RouteNode[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'api') {
        extractPagesApiRoutes(fullPath, baseDir, routes);
      } else {
        extractPagesRouterRoutes(fullPath, baseDir, routes);
      }
      continue;
    }

    if (!['.ts', '.tsx', '.js', '.jsx'].some((e) => entry.name.endsWith(e))) continue;
    if (entry.name.startsWith('_')) continue; // _app, _document

    const name = basename(entry.name).replace(/\.(ts|tsx|js|jsx)$/, '');
    const relDir = relative(baseDir, dir);
    const routePath = `/${relDir ? relDir + '/' : ''}${name === 'index' ? '' : name}`.replace(/\/+/g, '/') || '/';

    routes.push({
      path: routePath,
      filePath: relative(process.cwd(), fullPath),
      isDynamic: routePath.includes('['),
    });
  }
}

function extractPagesApiRoutes(
  dir: string,
  baseDir: string,
  routes: RouteNode[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      extractPagesApiRoutes(fullPath, baseDir, routes);
      continue;
    }

    if (!['.ts', '.tsx', '.js', '.jsx'].some((e) => entry.name.endsWith(e))) continue;

    const name = basename(entry.name).replace(/\.(ts|tsx|js|jsx)$/, '');
    const relDir = relative(baseDir, dir);
    const routePath = `/${relDir ? relDir + '/' : ''}${name === 'index' ? '' : name}`.replace(/\/+/g, '/');

    routes.push({
      path: routePath,
      filePath: relative(process.cwd(), fullPath),
      method: 'handler',
      isDynamic: routePath.includes('['),
    });
  }
}

function dirToRoutePath(relPath: string): string {
  if (!relPath) return '/';
  // Remove route groups like (authenticated)
  const cleaned = relPath
    .split('/')
    .filter((segment) => !segment.startsWith('('))
    .join('/');
  return `/${cleaned}` || '/';
}

function findLayoutFile(dir: string, baseDir: string): string | undefined {
  let current = dir;
  while (current.startsWith(baseDir)) {
    for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
      const layoutPath = join(current, `layout${ext}`);
      try {
        statSync(layoutPath);
        return layoutPath;
      } catch {
        // Not found
      }
    }
    current = dirname(current);
  }
  return undefined;
}

function extractApiMethods(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const methods: string[] = [];
    const methodRegex = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(content)) !== null) {
      methods.push(match[1]);
    }
    return methods.length > 0 ? methods : ['handler'];
  } catch {
    return ['handler'];
  }
}
