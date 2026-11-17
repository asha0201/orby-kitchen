// End-to-end smoke test of the Orby UI in a phone-sized browser.
// Optional browser smoke test (not part of npm test). Needs Playwright and a running app.
// Usage: BASE_URL=http://localhost:3000 SHOTS_DIR=./shots node test/e2e-smoke.js
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const { chromium, devices } = require('playwright');
const SHOTS = process.env.SHOTS_DIR || '.';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const step = async (name, fn) => {
    try { await fn(); console.log('ok  ', name); }
    catch (e) { console.log('FAIL', name, '-', e.message.split('\n')[0]); errors.push(`${name}: ${e.message.split('\n')[0]}`); }
  };

  await page.goto('' + BASE + '/#/today');

  await step('setup screen shows', async () => {
    await page.waitForSelector('form[data-form="setup"]', { timeout: 5000 });
  });
  await step('create household with PINs', async () => {
    await page.fill('input[name="asha"]', '1111');
    await page.fill('input[name="prabha"]', '2222');
    await page.click('form[data-form="setup"] button[type="submit"]');
    await page.waitForSelector('[data-action="pick-person"][data-id="asha"]');
  });
  await step('sign in as Asha', async () => {
    await page.click('[data-action="pick-person"][data-id="asha"]');
    await page.fill('input[name="pin"]', '1111');
    await page.click('form[data-form="login"] button[type="submit"]');
    await page.waitForSelector('#tabbar a.tab');
  });
  await page.screenshot({ path: `${SHOTS}/01-today.png`, fullPage: false });

  await step('today shows onboarding gate', async () => {
    await page.waitForSelector('text=onboarding item(s) open');
  });

  await step('plan is locked before onboarding', async () => {
    await page.goto('' + BASE + '/#/plan');
    await page.waitForSelector('text=Plan generation is locked');
    await page.click('button[data-action="gen-fill"]');
    await page.waitForURL(/#\/profiles/, { timeout: 5000 });
  });

  await step('save household onboarding', async () => {
    const f = page.locator('form[data-scope="household"]');
    await f.locator('[name="routine"]').fill('Both work weekdays, dinner around 8 pm');
    await f.locator('[name="weekday_cook_minutes"]').fill('30');
    await f.locator('[name="appliances"]').fill('none');
    await f.locator('[name="batch_prep"]').fill('not sure');
    await f.locator('[name="meal_frequency"]').fill('3 meals plus an evening snack');
    await f.locator('[name="food_budget"]').fill('skip');
    await f.locator('button[type="submit"]').click();
    await page.waitForSelector('text=Saved.');
  });

  await step('save Asha onboarding', async () => {
    const f = page.locator('form[data-scope="asha"]');
    await f.locator('[name="allergies"]').fill('none');
    await f.locator('[name="additional_dislikes"]').fill('none');
    await f.locator('[name="portion_factor"]').fill('1');
    await f.locator('[name="postpartum_stage"]').fill('Context only');
    await f.locator('[name="breastfeeding_pattern"]').fill('Context only');
    await f.locator('[name="height_cm"]').fill('160');
    await f.locator('[name="clinician_guidance"]').fill('planned');
    await f.locator('button[type="submit"]').click();
    await page.waitForSelector('text=Saved.');
  });

  await step('Prabha onboarding completes profile', async () => {
    const f = page.locator('form[data-scope="prabha"]');
    await f.locator('[name="allergies"]').fill('none');
    await f.locator('[name="additional_dislikes"]').fill('none');
    await f.locator('[name="portion_factor"]').fill('1.5');
    await f.locator('[name="fitness_goal"]').fill('Maintain strength and fitness');
    await f.locator('[name="protein_target_g"]').fill('not sure');
    await f.locator('button[type="submit"]').click();
    await page.waitForSelector('text=Onboarding complete');
  });

  await step('add a recipe through the form', async () => {
    await page.goto('' + BASE + '/#/recipes/new');
    await page.fill('#r-name', 'Air-fryer chicken');
    await page.check('input[name="meal_types"][value="dinner"]');
    await page.fill('#r-total', '25');
    await page.fill('#r-ing', '500 g chicken\n1 tbsp garlic paste');
    await page.fill('#r-steps', 'Marinate the chicken\nAir fry at 180 C for 18 minutes, shaking halfway');
    await page.fill('#r-af', '180 C, 18 min, shake halfway');
    await page.click('details summary:has-text("Nutrition")');
    await page.fill('#n-p', '40');
    await page.fill('#n-s', 'label estimate');
    await page.click('form[data-form="recipe"] button[type="submit"]');
    await page.waitForSelector('h1:has-text("Air-fryer chicken")');
    await page.screenshot({ path: `${SHOTS}/02-recipe.png`, fullPage: false });
  });

  await step('generate monthly plan', async () => {
    await page.goto('' + BASE + '/#/plan');
    await page.click('button[data-action="gen-fill"]');
    await page.waitForSelector('text=Filled');
    await page.waitForSelector('.day');
    await page.screenshot({ path: `${SHOTS}/03-plan.png`, fullPage: false });
  });

  await step('add pantry chicken and cook with deduction', async () => {
    await page.goto('' + BASE + '/#/pantry');
    await page.fill('#pa-name', 'chicken');
    await page.fill('#pa-q', '800');
    await page.fill('#pa-u', 'g');
    await page.click('form[data-form="pantry-add"] button[type="submit"]');
    await page.waitForSelector('text=Added to pantry');
    await page.goto('' + BASE + '/#/recipes/1/cook');
    await page.waitForSelector('input[data-pantry-id]');
    await page.screenshot({ path: `${SHOTS}/04-cook.png`, fullPage: false });
    await page.click('form[data-form="cook-confirm"] button[type="submit"]');
    await page.waitForSelector('.toast:has-text("Logged")');
  });

  await step('pantry reflects deduction (800 - 500 = 300 g)', async () => {
    await page.goto('' + BASE + '/#/pantry');
    await page.waitForSelector('input[aria-label="Quantity of chicken"]');
    const v = await page.inputValue('input[aria-label="Quantity of chicken"]');
    if (v !== '300') throw new Error(`expected 300, got ${v}`);
  });

  await step('shopping list from plan', async () => {
    await page.goto('' + BASE + '/#/shop');
    await page.fill('input[name="name"][placeholder="e.g. This week"]', 'This week');
    await page.click('form[data-form="list-create"] button[type="submit"]');
    await page.waitForSelector('text=This week');
    await page.waitForSelector('button[data-action="list-from-plan"]');
    await page.click('button[data-action="list-from-plan"]');
    await page.waitForSelector('text=missing from the plan');
  });

  await step('memory and feature request save', async () => {
    await page.goto('' + BASE + '/#/memory');
    await page.fill('#m-text', 'No chicken on Friday');
    await page.selectOption('#m-kind', 'one_time');
    await page.fill('#m-date', '2026-12-04');
    await page.selectOption('#m-effect', 'avoid_ingredient');
    await page.fill('#m-kw', 'chicken');
    await page.click('form[data-form="memory-add"] button[type="submit"]');
    await page.waitForSelector('text=No chicken on Friday');
    await page.goto('' + BASE + '/#/requests');
    await page.fill('#fr-text', 'Show tomorrow’s shopping list on the Today screen');
    await page.click('form[data-form="feature-add"] button[type="submit"]');
    await page.waitForSelector('text=Draft specification');
  });

  await step('no horizontal scroll at phone width', async () => {
    await page.goto('' + BASE + '/#/today');
    await page.waitForSelector('#tabbar a.tab');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px`);
  });

  await page.goto('' + BASE + '/#/plan');
  await page.waitForSelector('.day');
  await page.screenshot({ path: `${SHOTS}/05-plan-final.png`, fullPage: false });

  console.log(errors.length ? `\nERRORS (${errors.length}):\n${errors.join('\n')}` : '\nno browser errors');
  await browser.close();
})().catch((e) => { console.error('harness failed:', e); process.exit(1); });
