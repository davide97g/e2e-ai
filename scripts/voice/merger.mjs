/**
 * Format seconds as MM:SS.
 * @param {number} sec
 * @returns {string}
 */
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Extract real action timestamps from // @t:<seconds>s comments injected during codegen.
 * Returns an array of { lineIndex, elapsed } or null if no timestamps found.
 *
 * @param {string[]} lines
 * @param {number[]} actionIndices - line indices of action lines
 * @returns {number[] | null} elapsed seconds per action, or null
 */
function extractEmbeddedTimestamps(lines, actionIndices) {
  const tsPattern = /^\s*\/\/\s*@t:([\d.]+)s\s*$/;
  const timestamps = [];

  for (const actionIdx of actionIndices) {
    // Look at the line immediately before the action for a @t: comment
    if (actionIdx > 0 && tsPattern.test(lines[actionIdx - 1])) {
      const match = lines[actionIdx - 1].match(tsPattern);
      timestamps.push(parseFloat(match[1]));
    } else {
      // Missing timestamp for this action — can't use embedded timestamps
      return null;
    }
  }

  return timestamps;
}

/**
 * Merge codegen output with voice transcript segments.
 *
 * If the codegen contains // @t:<seconds>s comments (injected during recording),
 * those real timestamps are used for alignment. Otherwise, action timestamps are
 * distributed linearly across the session duration (fallback).
 *
 * @param {string} codegenContent - The original codegen .ts file content
 * @param {Array<{ start: number, end: number, text: string }>} segments - Whisper transcript segments
 * @param {number} durationSec - Total session duration in seconds (used only for linear fallback)
 * @returns {string} Annotated codegen content
 */
export function merge(codegenContent, segments, durationSec) {
  if (!segments || segments.length === 0) return codegenContent;

  const lines = codegenContent.split('\n');
  const actionPattern = /^\s*(await\s+page\.|await\s+expect\()/;
  const tsCommentPattern = /^\s*\/\/\s*@t:[\d.]+s\s*$/;

  // Find indices of action lines (skip @t: comment lines)
  const actionIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (actionPattern.test(lines[i])) {
      actionIndices.push(i);
    }
  }

  if (actionIndices.length === 0) return codegenContent;

  // Try to use embedded timestamps, fall back to linear distribution
  const embeddedTs = extractEmbeddedTimestamps(lines, actionIndices);
  const actionTimestamps = embeddedTs
    ? embeddedTs
    : actionIndices.map((_, idx) => {
        if (actionIndices.length === 1) return durationSec / 2;
        return (idx / (actionIndices.length - 1)) * durationSec;
      });

  // For each segment, find the nearest action by timestamp
  /** @type {Map<number, Array<{ start: number, end: number, text: string }>>} */
  const insertions = new Map();

  for (const seg of segments) {
    const segMid = (seg.start + seg.end) / 2;
    let bestIdx = 0;
    let bestDist = Math.abs(actionTimestamps[0] - segMid);

    for (let i = 1; i < actionTimestamps.length; i++) {
      const dist = Math.abs(actionTimestamps[i] - segMid);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const actionLineIdx = actionIndices[bestIdx];
    if (!insertions.has(actionLineIdx)) {
      insertions.set(actionLineIdx, []);
    }
    insertions.get(actionLineIdx).push(seg);
  }

  // Build result: strip old @t: comments and insert voice comments before action lines
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    // Skip @t: timestamp comments — they're consumed, not preserved
    if (tsCommentPattern.test(lines[i])) continue;

    const segs = insertions.get(i);
    if (segs) {
      const indent = lines[i].match(/^(\s*)/)[1];
      for (const seg of segs) {
        result.push(
          `${indent}// [Voice ${formatTime(seg.start)} - ${formatTime(seg.end)}] "${seg.text}"`,
        );
      }
    }
    result.push(lines[i]);
  }

  return result.join('\n');
}
