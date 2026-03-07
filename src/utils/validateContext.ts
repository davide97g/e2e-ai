const REQUIRED_SECTIONS = [
  'Application',
  'Test Infrastructure',
  'Feature Methods',
  'Import Conventions',
  'Selector Conventions',
  'Test Structure Template',
  'Utility Patterns',
];

export interface ValidationResult {
  valid: boolean;
  missingSections: string[];
  warnings: string[];
}

export function validateContext(content: string): ValidationResult {
  const missingSections: string[] = [];
  const warnings: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const pattern = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
    if (!pattern.test(content)) {
      missingSections.push(section);
    }
  }

  if (content.trim().length < 100) {
    warnings.push('Context file seems too short (< 100 chars). Aim for 100-300 lines.');
  }

  const codeBlockCount = (content.match(/```/g) ?? []).length / 2;
  if (codeBlockCount < 1) {
    warnings.push('No code examples found. Include at least a Test Structure Template code block.');
  }

  return {
    valid: missingSections.length === 0,
    missingSections,
    warnings,
  };
}
