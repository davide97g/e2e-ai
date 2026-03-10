import type { QAMapV2Payload } from './types.ts';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const WORKFLOW_TYPES = ['navigation', 'crud', 'multi-step', 'configuration', 'search-filter'];
const COMPONENT_TYPES = ['form', 'display', 'navigation', 'modal', 'layout', 'feedback'];
const SCENARIO_CATEGORIES = ['happy-path', 'permission', 'validation', 'error', 'edge-case', 'precondition'];
const SCENARIO_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const BRANCH_TYPES = ['validation', 'permission', 'error', 'business-logic'];

/**
 * Validate a QAMapV2Payload for schema correctness and referential integrity.
 */
export function validateQAMap(payload: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'], warnings };
  }

  const p = payload as Record<string, unknown>;

  // --- Required top-level arrays ---
  const features = assertArray(p, 'features', errors);
  const workflows = assertArray(p, 'workflows', errors);
  const components = assertArray(p, 'components', errors);
  const scenarios = assertArray(p, 'scenarios', errors);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // --- Collect IDs ---
  const featureIds = new Set<string>();
  const workflowIds = new Set<string>();
  const componentIds = new Set<string>();
  const scenarioIds = new Set<string>();
  const workflowStepIds = new Set<string>();

  // --- Validate features ---
  for (const f of features) {
    requireString(f, 'id', 'feature', errors);
    requireString(f, 'name', 'feature', errors);
    requireString(f, 'description', 'feature', errors);
    requireArray(f, 'routes', 'feature', errors);
    requireArray(f, 'workflowIds', 'feature', errors);
    requireArray(f, 'sourceFiles', 'feature', errors);
    if (f.id) {
      if (featureIds.has(f.id)) errors.push(`Duplicate feature id: ${f.id}`);
      featureIds.add(f.id);
    }
  }

  // --- Validate workflows ---
  for (const w of workflows) {
    requireString(w, 'id', 'workflow', errors);
    requireString(w, 'name', 'workflow', errors);
    requireString(w, 'featureId', 'workflow', errors);
    requireEnum(w, 'type', WORKFLOW_TYPES, 'workflow', errors);
    requireArray(w, 'preconditions', 'workflow', errors);
    requireArray(w, 'steps', 'workflow', errors);
    requireArray(w, 'componentIds', 'workflow', errors);
    if (w.id) {
      if (workflowIds.has(w.id)) errors.push(`Duplicate workflow id: ${w.id}`);
      workflowIds.add(w.id);
    }
    // Validate workflow steps
    if (Array.isArray(w.steps)) {
      for (const s of w.steps) {
        requireString(s, 'id', 'workflowStep', errors);
        requireNumber(s, 'order', 'workflowStep', errors);
        requireString(s, 'description', 'workflowStep', errors);
        requireArray(s, 'componentIds', 'workflowStep', errors);
        requireArray(s, 'apiCalls', 'workflowStep', errors);
        requireArray(s, 'conditionalBranches', 'workflowStep', errors);
        if (s.id) workflowStepIds.add(s.id);
        // Validate conditional branches
        if (Array.isArray(s.conditionalBranches)) {
          for (const b of s.conditionalBranches) {
            requireString(b, 'condition', 'conditionalBranch', errors);
            requireString(b, 'outcome', 'conditionalBranch', errors);
            requireEnum(b, 'type', BRANCH_TYPES, 'conditionalBranch', errors);
          }
        }
      }
    }
  }

  // --- Validate components ---
  for (const c of components) {
    requireString(c, 'id', 'component', errors);
    requireString(c, 'name', 'component', errors);
    requireEnum(c, 'type', COMPONENT_TYPES, 'component', errors);
    requireArray(c, 'sourceFiles', 'component', errors);
    requireArray(c, 'props', 'component', errors);
    requireArray(c, 'referencedByWorkflows', 'component', errors);
    if (c.id) {
      if (componentIds.has(c.id)) errors.push(`Duplicate component id: ${c.id}`);
      componentIds.add(c.id);
    }
  }

  // --- Validate scenarios ---
  for (const s of scenarios) {
    requireString(s, 'id', 'scenario', errors);
    requireString(s, 'workflowId', 'scenario', errors);
    requireString(s, 'featureId', 'scenario', errors);
    requireString(s, 'name', 'scenario', errors);
    requireString(s, 'description', 'scenario', errors);
    requireEnum(s, 'category', SCENARIO_CATEGORIES, 'scenario', errors);
    requireArray(s, 'preconditions', 'scenario', errors);
    requireArray(s, 'steps', 'scenario', errors);
    requireString(s, 'expectedOutcome', 'scenario', errors);
    requireArray(s, 'componentIds', 'scenario', errors);
    requireArray(s, 'workflowStepIds', 'scenario', errors);
    requireEnum(s, 'priority', SCENARIO_PRIORITIES, 'scenario', errors);
    if (s.id) {
      if (scenarioIds.has(s.id)) errors.push(`Duplicate scenario id: ${s.id}`);
      scenarioIds.add(s.id);
    }
    // Validate scenario steps
    if (Array.isArray(s.steps)) {
      for (const step of s.steps) {
        requireNumber(step, 'order', 'scenarioStep', errors);
        requireString(step, 'action', 'scenarioStep', errors);
        requireString(step, 'expectedResult', 'scenarioStep', errors);
      }
    }
  }

  // --- Referential integrity ---
  for (const w of workflows) {
    if (w.featureId && !featureIds.has(w.featureId)) {
      errors.push(`Workflow "${w.id}" references unknown feature: ${w.featureId}`);
    }
    if (Array.isArray(w.componentIds)) {
      for (const cid of w.componentIds) {
        if (!componentIds.has(cid)) {
          errors.push(`Workflow "${w.id}" references unknown component: ${cid}`);
        }
      }
    }
  }

  for (const f of features) {
    if (Array.isArray(f.workflowIds)) {
      for (const wid of f.workflowIds) {
        if (!workflowIds.has(wid)) {
          errors.push(`Feature "${f.id}" references unknown workflow: ${wid}`);
        }
      }
    }
  }

  for (const s of scenarios) {
    if (s.workflowId && !workflowIds.has(s.workflowId)) {
      errors.push(`Scenario "${s.id}" references unknown workflow: ${s.workflowId}`);
    }
    if (s.featureId && !featureIds.has(s.featureId)) {
      errors.push(`Scenario "${s.id}" references unknown feature: ${s.featureId}`);
    }
    if (Array.isArray(s.componentIds)) {
      for (const cid of s.componentIds) {
        if (!componentIds.has(cid)) {
          errors.push(`Scenario "${s.id}" references unknown component: ${cid}`);
        }
      }
    }
    if (Array.isArray(s.workflowStepIds)) {
      for (const wsid of s.workflowStepIds) {
        if (!workflowStepIds.has(wsid)) {
          errors.push(`Scenario "${s.id}" references unknown workflow step: ${wsid}`);
        }
      }
    }
  }

  for (const c of components) {
    if (Array.isArray(c.referencedByWorkflows)) {
      for (const wid of c.referencedByWorkflows) {
        if (!workflowIds.has(wid)) {
          errors.push(`Component "${c.id}" references unknown workflow: ${wid}`);
        }
      }
    }
  }

  // --- Warnings ---
  for (const f of features) {
    if (Array.isArray(f.workflowIds) && f.workflowIds.length === 0) {
      warnings.push(`Feature "${f.id}" has no workflows`);
    }
  }

  for (const w of workflows) {
    const hasScenarios = scenarios.some((s: any) => s.workflowId === w.id);
    if (!hasScenarios) {
      warnings.push(`Workflow "${w.id}" has no scenarios`);
    }
  }

  const referencedComponentIds = new Set<string>();
  for (const w of workflows) {
    if (Array.isArray(w.componentIds)) {
      for (const cid of w.componentIds) referencedComponentIds.add(cid);
    }
  }
  for (const c of components) {
    if (c.id && !referencedComponentIds.has(c.id)) {
      warnings.push(`Component "${c.id}" is not referenced by any workflow`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// --- Helpers ---

function assertArray(obj: Record<string, unknown>, field: string, errors: string[]): any[] {
  if (!Array.isArray(obj[field])) {
    errors.push(`Missing or invalid top-level array: ${field}`);
    return [];
  }
  return obj[field] as any[];
}

function requireString(obj: any, field: string, context: string, errors: string[]) {
  if (typeof obj?.[field] !== 'string' || obj[field].length === 0) {
    errors.push(`${context} missing required string field: ${field} (id: ${obj?.id ?? 'unknown'})`);
  }
}

function requireNumber(obj: any, field: string, context: string, errors: string[]) {
  if (typeof obj?.[field] !== 'number') {
    errors.push(`${context} missing required number field: ${field} (id: ${obj?.id ?? 'unknown'})`);
  }
}

function requireArray(obj: any, field: string, context: string, errors: string[]) {
  if (!Array.isArray(obj?.[field])) {
    errors.push(`${context} missing required array field: ${field} (id: ${obj?.id ?? 'unknown'})`);
  }
}

function requireEnum(obj: any, field: string, allowed: string[], context: string, errors: string[]) {
  if (typeof obj?.[field] !== 'string' || !allowed.includes(obj[field])) {
    errors.push(
      `${context} invalid ${field}: "${obj?.[field]}" — expected one of: ${allowed.join(', ')} (id: ${obj?.id ?? 'unknown'})`,
    );
  }
}
