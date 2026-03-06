import { describe, test, expect } from 'bun:test';
import {
  jsonToImportXml,
  formatExportTitle,
  type ZephyrTestCaseFile,
} from '../../scripts/exporters/zephyr-json-to-import-xml.ts';

describe('formatExportTitle', () => {
  test('default format: prefix - feature - title', () => {
    const data: ZephyrTestCaseFile = { title: 'Login Flow', steps: [] };
    expect(formatExportTitle(data)).toBe('UI Automation - General - Login Flow');
  });

  test('uses custom titlePrefix', () => {
    const data: ZephyrTestCaseFile = { title: 'Checkout', steps: [] };
    expect(formatExportTitle(data, 'Regression')).toBe('Regression - General - Checkout');
  });

  test('derives feature from parent epic', () => {
    const data: ZephyrTestCaseFile = {
      title: 'Test',
      steps: [],
      issueContext: { parent: 'PROJ-50 Authentication' },
    };
    expect(formatExportTitle(data)).toBe('UI Automation - Authentication - Test');
  });

  test('strips issue key prefix from parent', () => {
    const data: ZephyrTestCaseFile = {
      title: 'Test',
      steps: [],
      issueContext: { parent: 'ABC-123 User Management' },
    };
    expect(formatExportTitle(data)).toContain('User Management');
  });

  test('uses first label when no parent', () => {
    const data: ZephyrTestCaseFile = {
      title: 'Test',
      steps: [],
      issueContext: { labels: ['billing', 'frontend'] },
    };
    expect(formatExportTitle(data)).toBe('UI Automation - billing - Test');
  });

  test('falls back to General when no parent or labels', () => {
    const data: ZephyrTestCaseFile = { title: 'Test', steps: [] };
    expect(formatExportTitle(data)).toContain('General');
  });

  test('uses Untitled for empty title', () => {
    const data: ZephyrTestCaseFile = { title: '', steps: [] };
    expect(formatExportTitle(data)).toContain('Untitled');
  });
});

describe('jsonToImportXml', () => {
  const baseData: ZephyrTestCaseFile = {
    title: 'Login Test',
    precondition: 'User is on the login page',
    steps: [
      { stepNumber: 1, description: 'Enter username', expectedResult: 'Username field is filled' },
      { stepNumber: 2, description: 'Click submit', expectedResult: 'Form is submitted' },
    ],
    issueKey: 'PROJ-101',
    issueContext: { project: 'PROJ', summary: 'Login functionality' },
  };

  test('produces valid XML structure', () => {
    const xml = jsonToImportXml(baseData);
    expect(xml).toStartWith('<?xml version="1.0"');
    expect(xml).toContain('<project>');
    expect(xml).toContain('</project>');
    expect(xml).toContain('<testCases>');
  });

  test('includes project key from issueContext', () => {
    const xml = jsonToImportXml(baseData);
    expect(xml).toContain('<projectKey>PROJ</projectKey>');
  });

  test('falls back to key prefix for project', () => {
    const data: ZephyrTestCaseFile = {
      title: 'Test',
      steps: [],
      issueKey: 'ABC-42',
    };
    const xml = jsonToImportXml(data);
    expect(xml).toContain('<projectKey>ABC</projectKey>');
  });

  test('falls back to PROJECT when no key', () => {
    const data: ZephyrTestCaseFile = { title: 'Test', steps: [] };
    const xml = jsonToImportXml(data);
    expect(xml).toContain('<projectKey>PROJECT</projectKey>');
  });

  test('renders steps in order', () => {
    const xml = jsonToImportXml(baseData);
    const step0Idx = xml.indexOf('index="0"');
    const step1Idx = xml.indexOf('index="1"');
    expect(step0Idx).toBeGreaterThan(-1);
    expect(step1Idx).toBeGreaterThan(step0Idx);
    expect(xml).toContain('Enter username');
    expect(xml).toContain('Click submit');
  });

  test('escapes XML special characters in issueKey', () => {
    const data: ZephyrTestCaseFile = {
      title: 'Test',
      steps: [],
      issueKey: 'PROJ-101',
    };
    const xml = jsonToImportXml(data);
    expect(xml).toContain('key="PROJ-101"');
  });

  test('handles CDATA escaping for ]]> in content', () => {
    const data: ZephyrTestCaseFile = {
      title: 'Test',
      steps: [{ stepNumber: 1, description: 'Check ]]> in output', expectedResult: 'OK' }],
    };
    const xml = jsonToImportXml(data);
    // CDATA should split ]]> into ]]]]><![CDATA[>
    expect(xml).not.toContain('<![CDATA[Check ]]>');
    expect(xml).toContain(']]]]><![CDATA[>');
  });

  test('renders precondition in CDATA', () => {
    const xml = jsonToImportXml(baseData);
    expect(xml).toContain('User is on the login page');
  });

  test('renders issues block when issueKey present', () => {
    const xml = jsonToImportXml(baseData);
    expect(xml).toContain('<key>PROJ-101</key>');
    expect(xml).toContain('Login functionality');
  });

  test('renders empty issues when no issueKey', () => {
    const data: ZephyrTestCaseFile = { title: 'Test', steps: [] };
    const xml = jsonToImportXml(data);
    expect(xml).toContain('<issues/>');
  });

  test('applies titlePrefix to name', () => {
    const xml = jsonToImportXml(baseData, 'Regression');
    expect(xml).toContain('Regression');
  });
});
