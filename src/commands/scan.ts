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
