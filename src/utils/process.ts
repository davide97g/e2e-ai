import { spawn, type SpawnOptions, type ChildProcess } from 'node:child_process';

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function spawnInteractive(command: string, args: string[], options?: SpawnOptions): ChildProcess {
  return spawn(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

export function spawnAndCapture(command: string, args: string[], options?: SpawnOptions): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    child.on('error', reject);

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export function waitForProcess(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
