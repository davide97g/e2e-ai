import type { Command } from 'commander';
import { join, basename } from 'node:path';
import { readFile, writeFile, fileExists, findFileWithPattern } from '../utils/fs.ts';
import { getPackageRoot } from '../config/loader.ts';
import { resolveCommandContext } from './_shared.ts';
import * as log from '../utils/logger.ts';

export function registerTranscribe(program: Command) {
  program
    .command('transcribe [session]')
    .description('Transcribe .wav recording via OpenAI Whisper')
    .action(async (session?: string) => {
      const ctx = await resolveCommandContext(program);
      const root = ctx.paths.projectRoot;
      const pkgRoot = getPackageRoot();

      // Resolve the .wav file path
      let wavPath: string | undefined;
      if (session && session.endsWith('.wav')) {
        wavPath = join(root, session);
      } else if (ctx.key) {
        const keyDir = join(ctx.paths.workingDir, ctx.key, 'recordings');
        wavPath = findFileWithPattern(keyDir, /\.wav$/);
        if (!wavPath) {
          wavPath = findFileWithPattern(join(ctx.paths.workingDir, ctx.key), /voice-.*\.wav$/);
        }
      } else if (session) {
        wavPath = join(ctx.paths.recordingsDir, `${session}.wav`);
      }

      if (!wavPath || !fileExists(wavPath)) {
        log.error(`No .wav file found${wavPath ? ` at ${wavPath}` : ''}`);
        process.exit(1);
      }

      log.info(`Transcribing: ${wavPath}`);

      const transcriber = await import(join(pkgRoot, 'scripts', 'voice', 'transcriber.mjs'));
      const segments = await transcriber.transcribe(wavPath);

      if (!segments || segments.length === 0) {
        log.warn('No speech segments detected');
        return;
      }

      log.success(`Transcribed ${segments.length} segments`);

      const sessionName = basename(wavPath, '.wav');
      const outputDir = ctx.key
        ? join(ctx.paths.workingDir, ctx.key)
        : ctx.paths.transcriptsDir;
      const jsonPath = join(outputDir, `${sessionName}-transcript.json`);
      const mdPath = join(outputDir, `${sessionName}-transcript.md`);

      writeFile(jsonPath, JSON.stringify(segments, null, 2));
      log.success(`Transcript JSON: ${jsonPath}`);

      const md = generateTranscriptMd(sessionName, segments);
      writeFile(mdPath, md);
      log.success(`Transcript MD: ${mdPath}`);

      // Optionally merge into codegen
      if (ctx.key) {
        const codegenDir = join(ctx.paths.workingDir, ctx.key);
        const codegenFile = findFileWithPattern(codegenDir, /codegen-.*\.ts$/);
        if (codegenFile) {
          log.info('Merging voice comments into codegen...');
          const merger = await import(join(pkgRoot, 'scripts', 'voice', 'merger.mjs'));
          const codegenContent = readFile(codegenFile);
          const lastSegment = segments[segments.length - 1];
          const duration = lastSegment.end;
          const merged = merger.merge(codegenContent, segments, duration);
          writeFile(codegenFile, merged);
          log.success(`Voice comments merged into: ${codegenFile}`);
        }
      }
    });
}

function generateTranscriptMd(sessionName: string, segments: Array<{ start: number; end: number; text: string }>): string {
  const lines: string[] = [
    `# Transcript: ${sessionName}`,
    '',
    `**Segments**: ${segments.length}`,
    `**Duration**: ${formatTime(segments[segments.length - 1]?.end ?? 0)}`,
    '',
    '| Time | Text |',
    '|------|------|',
  ];

  for (const seg of segments) {
    lines.push(`| ${formatTime(seg.start)} - ${formatTime(seg.end)} | ${seg.text} |`);
  }

  return lines.join('\n') + '\n';
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
