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
