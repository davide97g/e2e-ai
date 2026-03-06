import type { ResolvedConfig } from '../config/schema.ts';

/**
 * Fetch issue context from Linear.
 * Placeholder for future Linear GraphQL API integration.
 */
export async function fetchLinearContext(
  key: string,
  config: ResolvedConfig,
): Promise<Record<string, unknown> | null> {
  // TODO: Implement Linear GraphQL API integration
  return null;
}
