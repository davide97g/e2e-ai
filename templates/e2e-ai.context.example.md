# Project Context for e2e-ai

## Application

- **Name**: My Application
- **Description**: A web application for managing resources
- **Tech Stack**: React, TypeScript, Material UI
- **Base URL**: https://app.example.com

## Test Infrastructure

### Fixtures
- `singleResourcePage` — Pre-authenticated page for single-resource user
- `multiResourcePage` — Pre-authenticated page for multi-resource user

### Helpers
- `createStepCounter()` — Returns a `nextStep(label)` function for sequential step naming
- `test` — Custom test object from `@config` with fixtures pre-registered

### Auth Pattern
- Login is handled by fixtures — test step 1 ("Log in") is a no-op
- Storage state cached in `.auth/` directory

## Feature Methods

### useFeatures(page)
Returns `{ appNav, settingsApp, dashboardApp }`

- `appNav.navigateTo(section)` — Navigate to a named section
- `appNav.waitForNavigation()` — Wait for navigation to complete
- `dashboardApp.waitForDashboard()` — Wait for dashboard to load

### useItemFeatures(page, appNav)
Returns `{ itemList, itemCreation, itemDetail }`

- `itemList.clickListButton()` — Switch to list view
- `itemList.clickGridButton()` — Switch to grid view
- `itemCreation.openCreateDialog()` — Open the create item modal
- `itemDetail.waitForDetail()` — Wait for detail panel to load

## Import Conventions

```typescript
import { createStepCounter, test } from '@config';
import { useFeatures } from '@features';
import { useItemFeatures } from '@features/items';
import { expect } from 'playwright/test';
```

Path aliases (from tsconfig.json):
- `@config` → `e2e/config`
- `@features` → `e2e/features`
- `@features/*` → `e2e/features/*`

## Selector Conventions

1. Prefer `getByRole`, `getByText`, `getByLabel` over CSS selectors
2. Use `[id^="item-"]` pattern for dynamically generated IDs
3. Use `data-testid` when semantic selectors are ambiguous
4. Never rely on generated CSS class names (e.g., `.css-xxxxx`)

## Test Structure Template

```typescript
import { createStepCounter, test } from '@config';
import { useFeatures } from '@features';
import { expect } from 'playwright/test';

test.describe('ISSUE-KEY - Test title', () => {
  test('Test title', async ({ singleResourcePage }) => {
    const { appNav } = useFeatures(singleResourcePage);
    const nextStep = createStepCounter();

    await test.step(nextStep('Log in with valid credentials'), async () => {
      // Expected: User is logged in and on the dashboard
      // Login handled by singleResourcePage fixture
    });

    await test.step(nextStep('Navigate to Items section'), async () => {
      // Expected: Items list is displayed
      await appNav.navigateTo('Items');
    });
  });
});
```

## Utility Patterns

- `{ timeout: 10000 }` for visibility assertions
- `{ timeout: 15000 }` for navigation waits
- `{ timeout: 500 }` for short animation waits
- Use `page.waitForLoadState('networkidle')` before asserting loaded data
- Wrap data-dependent assertions in try/catch with `// TODO: data-dependent` comment
