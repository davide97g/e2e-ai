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
 * Merge codegen output with voice transcript segments.
 *
 * Action lines (await page.* / await expect(*) are identified and distributed
 * linearly across the session duration. Each speech segment is inserted as a
 * comment before the nearest action line.
 *
 * @param {string} codegenContent - The original codegen .ts file content
 * @param {Array<{ start: number, end: number, text: string }>} segments - Whisper transcript segments
 * @param {number} durationSec - Total session duration in seconds
 * @returns {string} Annotated codegen content
 */
export function merge(codegenContent, segments, durationSec) {
  if (!segments || segments.length === 0) return codegenContent;

  const lines = codegenContent.split('\n');
  const actionPattern = /^\s*(await\s+page\.|await\s+expect\()/;

  // Find indices of action lines
  const actionIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (actionPattern.test(lines[i])) {
      actionIndices.push(i);
    }
  }

  if (actionIndices.length === 0) return codegenContent;

  // Estimate timestamp for each action: distribute linearly across the session
  const actionTimestamps = actionIndices.map((_, idx) => {
    if (actionIndices.length === 1) return durationSec / 2;
    return (idx / (actionIndices.length - 1)) * durationSec;
  });

  // For each segment, find the nearest action by timestamp
  // Map: actionIndex → list of segments to insert before it
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

  // Build result: insert comment lines before action lines
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const segs = insertions.get(i);
    if (segs) {
      // Detect indentation of the action line
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
