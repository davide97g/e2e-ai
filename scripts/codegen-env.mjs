#!/usr/bin/env node
/**
 * Run Playwright codegen against the app URL from your environment.
 * Accepts an issue key so the recording is saved under <workingDir>/<KEY>/.
 * Loads .env from the project root and passes BASE_URL to codegen.
 *
 * Environment variables (set by the CLI or directly):
 *   E2E_AI_PROJECT_ROOT  - Absolute path to the project root
 *   E2E_AI_WORKING_DIR   - Relative or absolute path to working directory (default: .e2e-ai)
 *   E2E_AI_KEY           - Issue key (e.g., PROJ-101, LIN-42, or any identifier)
 *
 * Usage:
 *   node codegen-env.mjs PROJ-101
 *   node codegen-env.mjs PROJ-101 --no-voice --no-trace
 *   E2E_AI_KEY=PROJ-101 node codegen-env.mjs
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Project root: prefer env var, then fall back to parent of scripts dir
const root = process.env.E2E_AI_PROJECT_ROOT || resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

/** Normalize an issue key to PROJECT-NNNN (uppercase project) or return as-is. */
function normalizeKey(key) {
  const s = String(key || '').trim();
  const match = s.match(/^([A-Za-z]+)-(\d+)$/i);
  if (match) {
    return `${match[1].toUpperCase()}-${match[2]}`;
  }
  return s || '';
}

/** Extract issue key from a URL (e.g. .../browse/PROJ-101) or plain string. */
function extractKey(input) {
  const s = String(input || '').trim();
  const browseMatch = s.match(/\/browse\/([A-Za-z]+-\d+)/i);
  if (browseMatch) return normalizeKey(browseMatch[1]);
  if (s.includes('-') && /^[A-Za-z]+-\d+$/i.test(s)) return normalizeKey(s);
  return normalizeKey(s);
}

// --- ANSI helpers ---
function setTerminalTitle(title) {
  process.stderr.write(`\x1b]0;${title}\x07`);
}

function printRecordingStatus(isRecording) {
  if (isRecording) {
    process.stderr.write('\x1b[97;41m \uD83C\uDFA4  Recording... \x1b[0m');
    process.stderr.write('  Press \x1b[1mR\x1b[0m to pause\n');
    setTerminalTitle('\uD83D\uDD34 Recording \u2014 codegen');
  } else {
    process.stderr.write('\x1b[97;43m \u23F8  Recording paused \x1b[0m');
    process.stderr.write('  Press \x1b[1mR\x1b[0m to resume\n');
    setTerminalTitle('\u23F8 Paused \u2014 codegen');
  }
}

loadEnv();
const baseUrl = process.env.BASE_URL;
const url = baseUrl ? baseUrl.replace(/\/$/, '') : 'about:blank';

// Parse CLI args
const rawArgs = process.argv.slice(2);
const voiceEnabled = !rawArgs.includes('--no-voice');
const traceEnabled = !rawArgs.includes('--no-trace');
const positionalArgs = rawArgs.filter((a) => !a.startsWith('--no-'));

const keyInput = positionalArgs[0];
const customOut = positionalArgs[1];
const issueKey = extractKey(process.env.E2E_AI_KEY || keyInput);

if (!issueKey) {
  console.error('Usage: node codegen-env.mjs <ISSUE_KEY_or_URL> [output-path]');
  console.error('Example: node codegen-env.mjs PROJ-101');
  console.error('  Or set E2E_AI_KEY=PROJ-101 and run: node codegen-env.mjs');
  process.exit(1);
}

// Resolve working directory from env or default
const workingDirRel = process.env.E2E_AI_WORKING_DIR || '.e2e-ai';
const workingDirAbs = isAbsolute(workingDirRel) ? workingDirRel : resolve(root, workingDirRel);
const issueDir = resolve(workingDirAbs, issueKey);
if (!existsSync(issueDir)) {
  mkdirSync(issueDir, { recursive: true });
  console.error(`Created: ${relative(root, issueDir)}/`);
}

const now = new Date();
const timestamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
  '-',
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
  String(now.getSeconds()).padStart(2, '0'),
].join('');
const defaultOut = resolve(issueDir, `codegen-${timestamp}.ts`);
const outputPath = customOut ? resolve(root, customOut) : defaultOut;
const outputRelative = relative(root, outputPath);

console.error(`Issue key: ${issueKey}`);
console.error(`Recording will be saved to: ${outputRelative}`);
console.error(`Voice recording: ${voiceEnabled ? 'ENABLED' : 'disabled (--no-voice)'}`);
console.error(`Trace replay:    ${traceEnabled ? 'ENABLED' : 'disabled (--no-trace)'}`);
console.error('(When you close the Playwright Inspector, the file is written there.)\n');

// --- Voice setup ---
let sessionStartTime = null;
let recording = false;
let currentRecProcess = null;
let segmentIndex = 0;
const segmentPaths = [];
let recordingsDir = null;

if (voiceEnabled) {
  // Resolve scripts relative to this file's location
  const { checkRecAvailable, startRecording } = await import(resolve(__dirname, 'voice', 'recorder.mjs'));
  checkRecAvailable();

  recordingsDir = resolve(issueDir, 'recordings');
  if (!existsSync(recordingsDir)) {
    mkdirSync(recordingsDir, { recursive: true });
  }

  sessionStartTime = Date.now();

  const segPath = resolve(recordingsDir, `seg-${String(segmentIndex).padStart(3, '0')}.wav`);
  segmentPaths.push(segPath);
  const rec = startRecording(segPath);
  currentRecProcess = rec.process;
  recording = true;
  segmentIndex++;

  console.error(`Audio segments saved to: ${relative(root, recordingsDir)}/`);
  printRecordingStatus(true);
}

// --- Auth setup: authenticate and cache storage state ---
const authDir = resolve(root, '.auth');
const storageStatePath = resolve(authDir, 'codegen.json');
if (!existsSync(authDir)) {
  mkdirSync(authDir, { recursive: true });
}

if (!existsSync(storageStatePath)) {
  console.error('Authenticating to cache storage state...');
  try {
    execSync(`node "${resolve(__dirname, 'auth', 'setup-auth.mjs')}"`, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, E2E_AI_PROJECT_ROOT: root },
    });
  } catch {
    console.error('Auth setup failed \u2014 codegen will start without cached auth.');
  }
}

// Spawn codegen with --load-storage (skip login) and --save-storage (update cache)
const codegenArgs = ['playwright', 'codegen', '--output', outputPath];
if (existsSync(storageStatePath)) {
  codegenArgs.push('--load-storage', storageStatePath);
  codegenArgs.push('--save-storage', storageStatePath);
  console.error('Using cached auth \u2014 codegen will start already logged in.');
}
codegenArgs.push(url);

const child = spawn('npx', codegenArgs, {
  stdio: ['ignore', 'inherit', 'inherit'],
  cwd: root,
  shell: true,
});

// --- Keyboard listener for pause/resume ---
if (voiceEnabled && process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');

  process.stdin.on('data', async (key) => {
    if (key === '\x03') {
      child.kill('SIGTERM');
      return;
    }

    if (key === 'r' || key === 'R') {
      const { startRecording, stopRecording } = await import(resolve(__dirname, 'voice', 'recorder.mjs'));

      if (recording) {
        await stopRecording(currentRecProcess);
        currentRecProcess = null;
        recording = false;
        printRecordingStatus(false);
      } else {
        const segPath = resolve(recordingsDir, `seg-${String(segmentIndex).padStart(3, '0')}.wav`);
        segmentPaths.push(segPath);
        const rec = startRecording(segPath);
        currentRecProcess = rec.process;
        recording = true;
        segmentIndex++;
        printRecordingStatus(true);
      }
    }
  });
}

function cleanupTerminal() {
  setTerminalTitle('');
  if (process.stdin.isTTY && voiceEnabled) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

child.on('exit', async (code) => {
  cleanupTerminal();

  if (code === 0) {
    console.error(`\nSaved: ${outputRelative}`);
  }

  // --- Voice post-processing ---
  if (voiceEnabled && segmentPaths.length > 0) {
    const sessionEndTime = Date.now();
    const durationSec = (sessionEndTime - sessionStartTime) / 1000;

    try {
      if (recording && currentRecProcess) {
        const { stopRecording } = await import(resolve(__dirname, 'voice', 'recorder.mjs'));
        await stopRecording(currentRecProcess);
        currentRecProcess = null;
        recording = false;
      }

      const existingSegments = segmentPaths.filter((p) => existsSync(p));

      if (existingSegments.length === 0) {
        console.error('No audio segments recorded.');
        process.exit(code ?? 0);
        return;
      }

      const mergedWavPath = resolve(recordingsDir, `voice-${timestamp}.wav`);

      if (existingSegments.length === 1) {
        renameSync(existingSegments[0], mergedWavPath);
      } else {
        console.error(`Merging ${existingSegments.length} audio segments...`);
        const args = ['--combine', 'concatenate', ...existingSegments, mergedWavPath];
        execSync(`sox ${args.map((a) => `"${a}"`).join(' ')}`, { stdio: 'ignore' });

        for (const seg of existingSegments) {
          try { unlinkSync(seg); } catch {}
        }
      }

      console.error(`Audio saved: ${relative(root, mergedWavPath)}`);

      const { transcribe } = await import(resolve(__dirname, 'voice', 'transcriber.mjs'));
      const segments = await transcribe(mergedWavPath);

      const transcriptPath = resolve(recordingsDir, `voice-${timestamp}.json`);
      writeFileSync(transcriptPath, JSON.stringify(segments, null, 2));
      console.error(`Transcript saved: ${relative(root, transcriptPath)}`);

      if (segments.length > 0 && existsSync(outputPath)) {
        const { merge } = await import(resolve(__dirname, 'voice', 'merger.mjs'));
        const codegenContent = readFileSync(outputPath, 'utf-8');
        const annotated = merge(codegenContent, segments, durationSec);
        writeFileSync(outputPath, annotated);
        console.error(`Merged ${segments.length} voice segment(s) into: ${outputRelative}`);
      }

      console.error('\nVoice recording summary:');
      console.error(`  Audio:      ${relative(root, mergedWavPath)}`);
      console.error(`  Transcript: ${relative(root, transcriptPath)}`);
      console.error(`  Codegen:    ${outputRelative}`);
    } catch (err) {
      console.error(`\nVoice processing error: ${err.message}`);
    }
  }

  // --- Trace: inject test.use and replay ---
  if (existsSync(outputPath)) {
    const codegenSrc = readFileSync(outputPath, 'utf-8');
    if (!codegenSrc.includes("test.use({ trace: 'on' })")) {
      const injected = codegenSrc.replace(
        /^(import\s.*from\s+['"]@playwright\/test['"];?\s*\n)/m,
        "$1\ntest.use({ trace: 'on' });\n",
      );
      if (injected !== codegenSrc) {
        writeFileSync(outputPath, injected);
        console.error("Injected test.use({ trace: 'on' }) into codegen output.");
      }
    }

    if (traceEnabled) {
      console.error('\nStarting trace replay...');
      try {
        const replayScript = resolve(__dirname, 'trace', 'replay-with-trace.mjs');
        execSync(`node "${replayScript}" "${outputRelative}"`, {
          cwd: root,
          stdio: 'inherit',
          env: { ...process.env, E2E_AI_PROJECT_ROOT: root },
        });
      } catch {
        console.error('Trace replay failed (codegen file is still saved).');
      }
    }
  }

  process.exit(code ?? 0);
});
