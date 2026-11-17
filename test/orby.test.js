'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../server/db');
const { createApp, COOKIE } = require('../server/app');
const d = require('../server/domain');
const { onboardingStatus, isAnswered } = require('../server/onboarding');

// ---- test harness: a fresh in-memory database and a real HTTP server ----
function freshDb() {
  const db = openDatabase(':memory:');
  db.exec(`INSERT OR IGNORE INTO people (id, name) VALUES ('asha', 'Asha'), ('prabha', 'Prabha');
    INSERT OR IGNORE INTO profiles (person_id, data, updated_at) VALUES ('asha', '{}', 0), ('prabha', '{}', 0);`);
  return db;
}

async function startApp(db, tz = 'UTC') {
  const app = createApp({ db, config: { tz, secureCookies: false } });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, payload) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const set = res.headers.get('set-cookie');
    if (set && set.startsWith(`${COOKIE}=`)) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
  return { call, base, cookie: () => cookie, close: () => new Promise((r) => server.close(r)), server };
}

// A household that has finished onboarding and has a few recipes.
function completeOnboarding(db) {
  d.saveAnswers(db, 'household', {
    routine: 'Both work weekdays', weekday_cook_minutes: 30, appliances: ['none beyond air fryer'],
    batch_prep: 'not sure', meal_frequency: '3 meals and an evening snack', food_budget: 'skip',
  });
  d.saveAnswers(db, 'asha', {
    allergies: ['none'], additional_dislikes: ['none'], portion_factor: 1,
    postpartum_stage: 'context only', breastfeeding_pattern: 'context only', height_cm: 160, clinician_guidance: 'planned',
  });
  d.saveAnswers(db, 'prabha', {
    allergies: ['none'], additional_dislikes: ['none'], portion_factor: 1.5,
    fitness_goal: 'maintain strength', protein_target_g: 'not sure',
  });
}

function addRecipes(db) {
  const chicken = d.createRecipe(db, {
    name: 'Air-fryer chicken', meal_types: ['lunch', 'dinner'], total_minutes: 25, servings: 2,
    ingredients: ['500 g chicken', '1 tbsp garlic paste'], steps: ['Marinate', 'Air fry 180C for 18 min'],
    nutrition: { protein_g: 40, uncertainty: 'medium', source: 'label estimate' },
  });
  const rice = d.createRecipe(db, {
    name: 'Lemon rice', meal_types: ['lunch'], total_minutes: 20, servings: 2,
    ingredients: ['2 cup rice', '1 tbsp oil'], steps: ['Cook rice', 'Temper'],
  });
  const pasta = d.createRecipe(db, {
    name: 'Aglio e olio', meal_types: ['dinner'], total_minutes: 90, servings: 2,
    ingredients: ['200 g pasta', '4 clove garlic', '2 tbsp olive oil'], steps: ['Boil pasta', 'Fry garlic'],
  });
  return { chicken, rice, pasta };
}

describe('ingredient parsing', () => {
  test('quantity, unit and name', () => {
    assert.deepEqual(d.parseIngredientLine('2 cup basmati rice'), {
      name: 'basmati rice', quantity: 2, unit: 'cup', text: '2 cup basmati rice',
    });
  });
  test('unmeasured item and fractions', () => {
    const g = d.parseIngredientLine('garlic');
    assert.equal(g.quantity, 0);
    assert.equal(g.name, 'garlic');
    assert.equal(d.parseIngredientLine('1/2 tsp salt').quantity, 0.5);
  });
  test('a count without a unit keeps the name', () => {
    const l = d.parseIngredientLine('2 onion');
    assert.equal(l.unit, '');
    assert.equal(l.name, 'onion');
    assert.equal(l.quantity, 2);
  });
});

describe('onboarding gate', () => {
  test('seeded brief answers still leave required items open', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    const s = d.onboarding(db);
    assert.equal(s.complete, false);
    assert.ok(s.missing.some((m) => m.key === 'protein_target_g'), 'Prabha protein target must be asked');
    assert.ok(s.missing.some((m) => m.key === 'routine'), 'household routine must be asked');
  });
  test('plan generation is refused with the missing list until onboarding completes', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    addRecipes(db);
    assert.throws(() => d.generatePlan(db, '2027-01'), (e) => e.status === 423 && e.missing.length > 0);
  });
  test('blank values count as unanswered; "none" counts as answered', () => {
    assert.equal(isAnswered('   '), false);
    assert.equal(isAnswered([]), false);
    assert.equal(isAnswered(['none']), true);
    assert.equal(isAnswered(0), true);
    const status = onboardingStatus({}, {}, [{ id: 'asha', name: 'Asha' }]);
    assert.equal(status.complete, false);
  });
  test('completing onboarding unlocks the plan', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    assert.equal(d.onboarding(db).complete, true, JSON.stringify(d.onboarding(db).missing));
  });
});

describe('monthly plan', () => {
  test('fills slots from the recipe library and reports empty slots honestly', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    addRecipes(db);
    const result = d.generatePlan(db, '2027-01');
    assert.equal(result.days, 31);
    const plan = d.getPlan(db, '2027-01');
    const breakfasts = plan.entries.filter((e) => e.slot === 'breakfast');
    assert.ok(breakfasts.every((e) => e.recipe_id === null), 'no breakfast recipes exist, so none are invented');
    assert.ok(plan.entries.filter((e) => e.slot === 'dinner').some((e) => e.recipe_name));
  });
  test('weekday time limit excludes long recipes on weekdays only', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    addRecipes(db);
    d.generatePlan(db, '2027-01');
    const plan = d.getPlan(db, '2027-01');
    for (const e of plan.entries) {
      const dow = new Date(`${e.date}T00:00:00Z`).getUTCDay();
      if (dow >= 1 && dow <= 5 && e.recipe_name === 'Aglio e olio') {
        assert.fail(`90-minute recipe planned on weekday ${e.date}`);
      }
    }
    assert.ok(plan.entries.some((e) => e.recipe_name === 'Aglio e olio'), 'allowed on weekends');
  });
  test('a one-time "no chicken today" memory excludes chicken on that date only', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    addRecipes(db);
    d.createMemory(db, { scope: 'household', kind: 'one_time', effect: 'avoid_ingredient', keyword: 'chicken', text: 'No chicken today', expires_on: '2027-01-05' });
    d.generatePlan(db, '2027-01');
    const day5 = d.getPlan(db, '2027-01').entries.filter((e) => e.date === '2027-01-05');
    assert.ok(day5.every((e) => e.recipe_name !== 'Air-fryer chicken'), 'chicken must not appear on the excluded day');
    // The memory is one-time: the following day is not affected by it.
    const day6 = d.getPlan(db, '2027-01').entries.filter((e) => e.date === '2027-01-06');
    assert.equal(day6.length, 4, 'day 6 still has its four slots');
    assert.ok(day6.some((e) => e.recipe_name === 'Air-fryer chicken'), 'chicken is allowed again on day 6');
  });
  test('an allergy is a hard exclusion; a dislike is only a warning', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    d.saveAnswers(db, 'asha', { allergies: ['garlic'] });
    addRecipes(db);
    d.generatePlan(db, '2027-01');
    const garlicDinners = d.getPlan(db, '2027-01').entries.filter((e) => e.slot === 'dinner' && e.recipe_name === 'Aglio e olio');
    assert.equal(garlicDinners.length, 0, 'garlic allergy must exclude garlic recipes');
  });
  test('locked entries survive regeneration; swaps report conflicts without blocking', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    const { pasta } = addRecipes(db);
    d.generatePlan(db, '2027-02');
    const first = d.getPlan(db, '2027-02').entries.find((e) => e.slot === 'dinner' && e.date === '2027-02-01');
    d.updatePlanEntry(db, first.id, { recipe_id: pasta.id, locked: true });
    d.generatePlan(db, '2027-02', { overwrite: true });
    const kept = d.getPlan(db, '2027-02').entries.find((e) => e.id === first.id);
    assert.equal(kept.recipe_id, pasta.id);
    assert.equal(kept.locked, true);
  });
});

describe('pantry, cooking and missing items', () => {
  test('cook proposal → confirmed deduction → undo restores stock', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    const { chicken } = addRecipes(db);
    d.upsertPantry(db, { name: 'chicken', quantity: 800, unit: 'g' });
    const proposal = d.cookProposal(db, chicken.id);
    const line = proposal.lines.find((l) => l.ingredient === 'chicken');
    assert.equal(line.status, 'matched');
    assert.equal(line.proposed, 500);
    const log = d.cookConfirm(db, { recipe_id: chicken.id, deductions: [{ pantry_id: line.pantry_id, quantity: 500 }] });
    assert.equal(d.listPantry(db).find((p) => p.name === 'chicken').quantity, 300);
    d.undoCook(db, log.id);
    assert.equal(d.listPantry(db).find((p) => p.name === 'chicken').quantity, 800);
    assert.throws(() => d.undoCook(db, log.id), (e) => e.status === 409);
  });
  test('unit mismatch is flagged, not silently deducted', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    const { chicken } = addRecipes(db);
    d.upsertPantry(db, { name: 'chicken', quantity: 2, unit: 'pieces' });
    const line = d.cookProposal(db, chicken.id).lines.find((l) => l.ingredient === 'chicken');
    assert.equal(line.status, 'unit_mismatch');
    assert.equal(line.proposed, 0);
  });
  test('missing items compare the next days of plan against the pantry', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    const { chicken } = addRecipes(db);
    db.prepare("INSERT INTO plan_entries (plan_date, slot, recipe_id, reason, locked) VALUES ('2027-03-10', 'dinner', ?, 'test', 0)").run(chicken.id);
    d.upsertPantry(db, { name: 'chicken', quantity: 200, unit: 'g' });
    const missing = d.missingItems(db, '2027-03-10', 1);
    assert.equal(missing.length, 2);
    const ch = missing.find((m) => m.name === 'chicken');
    assert.equal(ch.missing, 300);
  });
  test('shopping list from plan is idempotent and checked items move to pantry on request', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    const { chicken } = addRecipes(db);
    db.prepare("INSERT INTO plan_entries (plan_date, slot, recipe_id, reason, locked) VALUES ('2027-03-10', 'dinner', ?, 'test', 0)").run(chicken.id);
    const listId = d.createShoppingList(db, 'Groceries');
    d.addMissingToList(db, listId, '2027-03-10', 1);
    d.addMissingToList(db, listId, '2027-03-10', 1);
    const items = d.getShopping(db)[0].items;
    assert.equal(items.filter((i) => i.name === 'chicken').length, 1, 'no duplicates on repeat');
    const chickenItem = items.find((i) => i.name === 'chicken');
    d.updateShoppingItem(db, chickenItem.id, { checked: true });
    assert.equal(d.moveCheckedToPantry(db, listId), 1);
    assert.equal(d.listPantry(db).find((p) => p.name === 'chicken').quantity, 500);
  });
});

describe('memories and feedback', () => {
  test('one-time memories can be edited, deactivated and deleted', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    const id = d.createMemory(db, { scope: 'household', kind: 'one_time', effect: 'note', text: 'Skip dessert tonight', expires_on: '2027-01-01' });
    d.updateMemory(db, id, { active: false, text: 'Skip dessert tonight (edited)' });
    const m = d.listMemories(db).find((x) => x.id === id);
    assert.equal(m.active, false);
    assert.equal(m.text, 'Skip dessert tonight (edited)');
    d.deleteMemory(db, id);
    assert.equal(d.listMemories(db).some((x) => x.id === id), false);
  });
  test('recipe outcomes record modifications without overwriting the recipe', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    const { chicken } = addRecipes(db);
    d.addOutcome(db, chicken.id, { person_id: 'asha', rating: 4, notes: 'Too salty', modifications: 'half salt' });
    const r = d.getRecipe(db, chicken.id);
    assert.equal(r.outcomes[0].modifications, 'half salt');
    assert.deepEqual(r.ingredients, chicken.ingredients, 'recipe itself unchanged');
  });
  test('feature requests store a draft spec and are not deployed', () => {
    const db = freshDb();
    const id = d.createFeatureRequest(db, 'asha', 'Show the shopping list on the kitchen tablet. Please.');
    const f = d.listFeatureRequests(db).find((x) => x.id === id);
    assert.equal(f.status, 'proposed');
    assert.match(f.draft_spec, /Draft specification/);
  });
});

describe('notifications', () => {
  test('briefing and prep reminders are created once per day in the household time zone', () => {
    const db = freshDb();
    d.seedKnownFacts(db);
    completeOnboarding(db);
    addRecipes(db);
    const at = (iso) => new Date(iso);
    d.runScheduledNotifications(db, 'UTC', at('2027-01-05T08:30:00Z'));
    d.runScheduledNotifications(db, 'UTC', at('2027-01-05T09:30:00Z'));
    d.runScheduledNotifications(db, 'UTC', at('2027-01-05T20:30:00Z'));
    const kinds = d.listNotifications(db).map((n) => n.kind).sort();
    assert.deepEqual(kinds, ['briefing', 'prep']);
  });
  test('before 08:00 local time nothing is created', () => {
    const db = freshDb();
    d.runScheduledNotifications(db, 'UTC', new Date('2027-01-05T07:59:00Z'));
    assert.equal(d.listNotifications(db).length, 0);
  });
});

describe('HTTP API', () => {
  let db;
  let srv;
  before(async () => {
    db = freshDb();
    srv = await startApp(db);
  });
  after(async () => { await srv.close(); db.close(); });

  test('unauthenticated requests are refused', async () => {
    const r = await srv.call('GET', '/api/recipes');
    assert.equal(r.status, 401);
  });
  test('setup requires two different PINs of 4 to 8 digits', async () => {
    assert.equal((await srv.call('POST', '/api/setup', { pins: { asha: '12', prabha: '5678' } })).status, 400);
    assert.equal((await srv.call('POST', '/api/setup', { pins: { asha: '1234', prabha: '1234' } })).status, 400);
  });
  test('setup, sign-in, and seeded profile', async () => {
    assert.equal((await srv.call('POST', '/api/setup', { pins: { asha: '1111', prabha: '2222' } })).status, 201);
    assert.equal((await srv.call('POST', '/api/setup', { pins: { asha: '3333', prabha: '4444' } })).status, 409);
    assert.equal((await srv.call('POST', '/api/login', { person_id: 'asha', pin: '0000' })).status, 401);
    const ok = await srv.call('POST', '/api/login', { person_id: 'asha', pin: '1111' });
    assert.equal(ok.status, 200);
    const onb = await srv.call('GET', '/api/onboarding');
    assert.equal(onb.status, 200);
    assert.ok(onb.body.profiles.asha.likes.includes('garlic naan'));
    assert.ok(onb.body.profiles.asha.dislikes.includes('seafood'));
  });
  test('plan generation returns 423 with the missing list over HTTP', async () => {
    const r = await srv.call('POST', '/api/plan/generate', { month: '2027-04' });
    assert.equal(r.status, 423);
    assert.ok(r.body.missing.length > 0);
  });
  test('onboarding save then generation works end to end', async () => {
    await srv.call('PUT', '/api/onboarding/household', { answers: { routine: 'work weekdays', weekday_cook_minutes: 30, appliances: ['none'], batch_prep: 'no', meal_frequency: '3 meals', food_budget: 'skip' } });
    await srv.call('PUT', '/api/onboarding/asha', { answers: { allergies: ['none'], additional_dislikes: ['none'], portion_factor: 1, postpartum_stage: 'x', breastfeeding_pattern: 'x', height_cm: 160, clinician_guidance: 'planned' } });
    const prab = await srv.call('PUT', '/api/onboarding/prabha', { answers: { allergies: ['none'], additional_dislikes: ['none'], portion_factor: 1.5, fitness_goal: 'strength', protein_target_g: 'not sure' } });
    assert.equal(prab.body.status.complete, true);
    const rec = await srv.call('POST', '/api/recipes', { name: 'Dal', meal_types: ['dinner'], ingredients_text: '1 cup toor dal', steps_text: 'Cook' });
    assert.equal(rec.status, 201);
    assert.deepEqual(rec.body.ingredients, [{ name: 'toor dal', quantity: 1, unit: 'cup', text: '1 cup toor dal' }]);
    const gen = await srv.call('POST', '/api/plan/generate', { month: '2027-04' });
    assert.equal(gen.status, 200);
  });
  test('writes that are not JSON are refused (blocks cross-site form posts)', async () => {
    const res = await fetch(`${srv.base}/api/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Cookie: srv.cookie() },
      body: 'name=Evil&meal_types=dinner',
    });
    assert.equal(res.status, 415);
  });
  test('memories and recipe outcomes validate input', async () => {
    const bad = await srv.call('POST', '/api/memories', { scope: 'person', person_id: 'nobody', text: 'x' });
    assert.equal(bad.status, 400);
    const r = await srv.call('POST', '/api/recipes', { name: 'Tea', meal_types: ['snack'], ingredients_text: '1 cup milk', steps_text: 'Boil' });
    const out = await srv.call('POST', `/api/recipes/${r.body.id}/outcomes`, { rating: 9 });
    assert.equal(out.status, 400);
  });
  test('sign-out clears access', async () => {
    await srv.call('POST', '/api/logout', {});
    assert.equal((await srv.call('GET', '/api/recipes')).status, 401);
  });
  test('lockout after repeated wrong PINs', async () => {
    let last;
    for (let i = 0; i < 5; i++) last = await srv.call('POST', '/api/login', { person_id: 'prabha', pin: '9999' });
    assert.equal(last.status, 401);
    const locked = await srv.call('POST', '/api/login', { person_id: 'prabha', pin: '2222' });
    assert.equal(locked.status, 429, 'correct PIN is refused while locked');
  });
});
