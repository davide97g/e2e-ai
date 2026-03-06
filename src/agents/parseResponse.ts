/**
 * Extract JSON from an LLM response that may contain markdown fences or extra text.
 */
export function extractJSON(content: string): string {
  // Try direct parse first
  const trimmed = content.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}

  // Try extracting from markdown code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      JSON.parse(fenceMatch[1]);
      return fenceMatch[1];
    } catch {}
  }

  // Try finding the first { ... } or [ ... ] block
  const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      JSON.parse(jsonMatch[1]);
      return jsonMatch[1];
    } catch {}
  }

  throw new Error(`Could not extract JSON from LLM response. First 200 chars: ${trimmed.slice(0, 200)}`);
}

/**
 * Extract YAML from an LLM response that may contain markdown fences or extra text.
 */
export function extractYAML(content: string): string {
  const trimmed = content.trim();

  // Try extracting from markdown code fence
  const fenceMatch = trimmed.match(/```(?:ya?ml)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1];
  }

  // If it starts with a YAML-like key, return as-is
  if (trimmed.match(/^\w+:/m)) {
    return trimmed;
  }

  // Try to find YAML block after prose
  const yamlStart = trimmed.search(/^name:/m);
  if (yamlStart !== -1) {
    return trimmed.slice(yamlStart);
  }

  return trimmed;
}

/**
 * Strip markdown code fences from a code response.
 */
export function extractCode(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```\w*\n/, '').replace(/\n```$/, '');
  }
  return trimmed;
}
