// === AST Scanner Types (Stage 1) ===

export interface ASTScanResult {
  version: '1.0';
  scannedAt: string;
  language: string;
  stats: { totalFiles: number; totalLines: number };
  files: FileNode[];
  routes: RouteNode[];
  components: ComponentNode[];
  hooks: HookNode[];
  dependencies: DependencyEdge[];
}

export interface FileNode {
  path: string;
  language: string;
  lines: number;
  exports: string[];
  imports: ImportInfo[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
}

export interface RouteNode {
  path: string;
  filePath: string;
  method?: string;
  isDynamic: boolean;
  layoutFile?: string;
}

export interface ComponentNode {
  name: string;
  filePath: string;
  props: string[];
  isExported: boolean;
  hasJSX: boolean;
  hookCalls: string[];
}

export interface HookNode {
  name: string;
  filePath: string;
  isCustom: boolean;
  dependencies: string[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  specifiers: string[];
}

// === V2 QA Map Types ===

export interface FeatureV2 {
  id: string;
  name: string;
  description: string;
  routes: string[];
  workflowIds: string[];
  sourceFiles: string[];
}

export interface WorkflowV2 {
  id: string;
  name: string;
  featureId: string;
  type: 'navigation' | 'crud' | 'multi-step' | 'configuration' | 'search-filter';
  preconditions: string[];
  steps: WorkflowStepV2[];
  componentIds: string[];
}

export interface WorkflowStepV2 {
  id: string;
  order: number;
  description: string;
  componentIds: string[];
  apiCalls: string[];
  conditionalBranches: ConditionalBranch[];
}

export interface ConditionalBranch {
  condition: string;
  outcome: string;
  type: 'validation' | 'permission' | 'error' | 'business-logic';
}

export interface ComponentV2 {
  id: string;
  name: string;
  type: 'form' | 'display' | 'navigation' | 'modal' | 'layout' | 'feedback';
  sourceFiles: string[];
  props: string[];
  referencedByWorkflows: string[];
}

export type ScenarioCategory =
  | 'happy-path'
  | 'permission'
  | 'validation'
  | 'error'
  | 'edge-case'
  | 'precondition';

export type ScenarioPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ScenarioStep {
  order: number;
  action: string;
  expectedResult: string;
}

export interface ScenarioV2 {
  id: string;
  workflowId: string;
  featureId: string;
  name: string;
  description: string;
  category: ScenarioCategory;
  preconditions: string[];
  steps: ScenarioStep[];
  expectedOutcome: string;
  componentIds: string[];
  workflowStepIds: string[];
  priority: ScenarioPriority;
}

export interface QAMapV2Payload {
  features: FeatureV2[];
  workflows: WorkflowV2[];
  components: ComponentV2[];
  scenarios: ScenarioV2[];
  commitSha?: string;
  metadata?: Record<string, unknown>;
}

export interface ASTSummary {
  stats: { totalFiles: number; totalLines: number };
  routes: Array<{ path: string; filePath: string; isDynamic: boolean }>;
  fileTree: string[];
  componentNames: string[];
  hookNames: string[];
  directoryGroups: Record<string, number>;
  astScanPath: string;
}

export interface PushResult {
  version: number;
  schemaVersion: number;
  appId: string;
  pushedAt: string;
  stats: {
    features: number;
    workflows: number;
    components: number;
    scenarios: number;
    autoLinkedScenarios: number;
  };
}
