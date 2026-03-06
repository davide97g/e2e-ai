import { spawn, execSync } from 'node:child_process';

/**
 * Check that the `rec` command (from sox) is available.
 * Throws a clear error if not installed.
 */
export function checkRecAvailable() {
  try {
    execSync('which rec', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'The "rec" command is not available.\n' +
        'Install sox to enable voice recording:\n' +
        '  brew install sox          # macOS\n' +
        '  sudo apt install sox      # Debian/Ubuntu\n',
    );
  }
}

/**
 * Start recording audio from the microphone to a WAV file.
 * @param {string} wavPath - Absolute path to the output .wav file
 * @returns {{ process: import('node:child_process').ChildProcess, startTime: number }}
 */
export function startRecording(wavPath) {
  checkRecAvailable();

  const recProcess = spawn('rec', ['-q', '-r', '16000', '-c', '1', '-b', '16', wavPath], {
    stdio: 'ignore',
  });

  recProcess.on('error', (err) => {
    console.error(`Recording process error: ${err.message}`);
  });

  return { process: recProcess, startTime: Date.now() };
}

/**
 * Stop recording by sending SIGTERM and waiting for the process to close.
 * @param {import('node:child_process').ChildProcess} recProcess
 * @returns {Promise<void>}
 */
export function stopRecording(recProcess) {
  return new Promise((resolve, reject) => {
    if (!recProcess || recProcess.killed) {
      resolve();
      return;
    }
    recProcess.on('close', () => resolve());
    recProcess.on('error', reject);
    recProcess.kill('SIGTERM');
  });
}
