import { readFileSync } from 'node:fs';

/**
 * Transcribe a WAV file using OpenAI Whisper API.
 * Returns an array of segments with start/end timestamps (seconds) and text.
 *
 * Requires OPENAI_API_KEY in the environment.
 * If the key is missing, logs a warning and returns an empty array.
 *
 * @param {string} wavPath - Absolute path to the .wav file
 * @returns {Promise<Array<{ start: number, end: number, text: string }>>}
 */
export async function transcribe(wavPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      'Warning: OPENAI_API_KEY not set — skipping voice transcription.\n' +
        'Set it in .env to enable automatic transcription.',
    );
    return [];
  }

  const fileBuffer = readFileSync(wavPath);
  const blob = new Blob([fileBuffer], { type: 'audio/wav' });

  const formData = new FormData();
  formData.append('file', blob, 'recording.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  return (result.segments || []).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));
}
