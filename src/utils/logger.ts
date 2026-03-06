import pc from 'picocolors';

let verboseEnabled = false;

export function setVerbose(enabled: boolean) {
  verboseEnabled = enabled;
}

export function info(msg: string) {
  console.log(pc.blue('i') + ' ' + msg);
}

export function success(msg: string) {
  console.log(pc.green('✓') + ' ' + msg);
}

export function warn(msg: string) {
  console.log(pc.yellow('!') + ' ' + msg);
}

export function error(msg: string) {
  console.error(pc.red('✗') + ' ' + msg);
}

export function step(current: number, total: number, name: string, description: string) {
  console.log(pc.cyan(`[${current}/${total}]`) + ' ' + pc.bold(name) + ': ' + description);
}

export function verbose(msg: string) {
  if (verboseEnabled) {
    console.log(pc.gray('  ' + msg));
  }
}

export function header(title: string) {
  console.log('\n' + pc.bold(pc.magenta(title)));
  console.log(pc.gray('─'.repeat(title.length + 4)));
}

export function banner(version: string) {
  const title = `  e2e-ai  v${version}`;
  const subtitle = '  AI-powered E2E test automation';
  const width = Math.max(title.length, subtitle.length) + 2;

  const top = pc.cyan('┌' + '─'.repeat(width) + '┐');
  const mid1 = pc.cyan('│') + pc.bold(title) + ' '.repeat(width - title.length) + pc.cyan('│');
  const mid2 = pc.cyan('│') + pc.gray(subtitle) + ' '.repeat(width - subtitle.length) + pc.cyan('│');
  const bottom = pc.cyan('└' + '─'.repeat(width) + '┘');

  console.log(top);
  console.log(mid1);
  console.log(mid2);
  console.log(bottom);
}

export function summary(
  steps: Array<{ name: string; result: { success: boolean }; durationMs: number }>,
) {
  const nameCol = 16;
  const statusCol = 10;

  const headerLine =
    'Step'.padEnd(nameCol) + 'Status'.padEnd(statusCol) + 'Duration';
  const separator = '─'.repeat(nameCol + statusCol + 8);

  console.log(pc.bold(headerLine));
  console.log(pc.gray(separator));

  for (const s of steps) {
    const name = s.name.padEnd(nameCol);
    const status = s.result.success
      ? pc.green('✓ pass'.padEnd(statusCol))
      : pc.red('✗ fail'.padEnd(statusCol));
    const duration =
      s.durationMs >= 1000
        ? `${(s.durationMs / 1000).toFixed(1)}s`
        : `${Math.round(s.durationMs)}ms`;
    console.log(name + status + duration);
  }
}
