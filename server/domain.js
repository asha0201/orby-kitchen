'use strict';
// Kitchen domain logic: recipes, meal plans, pantry, cooking deductions,
// shopping, memories and briefings. Works on a node:sqlite handle.
const { onboardingStatus, isAnswered, seedAnswers, SEED_MEMORIES } = require('./onboarding');

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const RECENT_WINDOW_DAYS = 3; // avoid repeating a recipe within this many days when possible
const UNITS = new Set([
  'g', 'gram', 'grams', 'kg', 'ml', 'l', 'litre', 'liter', 'tsp', 'tbsp', 'cup', 'cups', 'pinch',
  'piece', 'pieces', 'clove', 'cloves', 'nos', 'whole', 'bunch', 'slice', 'slices', 'tin', 'packet', 'pack',
]);

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// ---------- dates in the household time zone ----------

function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}
const todayIn = (tz, date = new Date()) => localParts(date, tz).date;
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekdayOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
function monthDates(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym || '')) throw new HttpError(400, 'Month must look like 2026-12.');
  const first = `${ym}-01`;
  const out = [];
  for (let i = 0; i < 31; i++) {
    const d = addDays(first, i);
    if (!d.startsWith(ym)) break;
    out.push(d);
  }
  return out;
}

// ---------- small helpers ----------

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const json = (v, fallback) => (v === undefined || v === null ? fallback : JSON.stringify(v));
const parse = (s, fallback) => {
  if (s === null || s === undefined || s === '') return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};
const now = () => Date.now();

// "2 cup basmati rice" -> {quantity 2, unit 'cup', name 'basmati rice'}
// "garlic"            -> {quantity 0, unit '', name 'garlic'} (unmeasured)
function parseIngredientLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  const m = text.match(/^(\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  let quantity = 0;
  let rest = text;
  if (m) {
    quantity = m[1].includes('/') ? Number(m[1].split('/')[0]) / Number(m[1].split('/')[1]) : Number(m[1]);
    rest = m[2];
  }
  const words = rest.split(/\s+/);
  let unit = '';
  if (m && words.length > 1 && UNITS.has(words[0].toLowerCase())) {
    unit = words[0].toLowerCase();
    rest = words.slice(1).join(' ');
  }
  const name = rest.trim();
  if (!name) return null;
  return { name, quantity, unit, text };
}

function parseIngredientLines(text) {
  return String(text || '').split(/\r?\n/).map(parseIngredientLine).filter(Boolean);
}

// ---------- household and profiles ----------

function getHousehold(db) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM household').all()) out[r.key] = parse(r.value, null);
  return out;
}

function setHousehold(db, key, value) {
  db.prepare('INSERT INTO household (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, json(value, null));
}

function people(db) {
  return db.prepare('SELECT id, name FROM people ORDER BY name').all();
}

function getProfiles(db) {
  const out = {};
  for (const r of db.prepare('SELECT person_id, data FROM profiles').all()) {
    out[r.person_id] = parse(r.data, {}).answers || {};
  }
  return out;
}

function getProfile(db, personId) {
  const row = db.prepare('SELECT data FROM profiles WHERE person_id = ?').get(personId);
  if (!row) throw new HttpError(404, 'Profile not found.');
  return parse(row.data, {}).answers || {};
}

function onboarding(db) {
  return onboardingStatus(getHousehold(db), getProfiles(db), people(db));
}

// Writes answers (merging) for the household or one person. Blank values are
// stored as null so they count as unanswered.
function saveAnswers(db, scope, answers) {
  if (!answers || typeof answers !== 'object') throw new HttpError(400, 'answers must be an object.');
  const clean = {};
  for (const [k, v] of Object.entries(answers)) {
    if (!/^[a-z_]{2,40}$/.test(k)) throw new HttpError(400, `Invalid field name: ${k}`);
    if (Array.isArray(v)) clean[k] = v.map((x) => String(x).trim()).filter(Boolean);
    else if (typeof v === 'number') clean[k] = Number.isFinite(v) ? v : null;
    else clean[k] = v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim();
  }
  if (scope === 'household') {
    const current = getHousehold(db);
    for (const [k, v] of Object.entries(clean)) setHousehold(db, k, v);
    return { ...current, ...clean };
  }
  if (!db.prepare('SELECT 1 FROM people WHERE id = ?').get(scope)) throw new HttpError(404, 'Unknown person.');
  const existing = db.prepare('SELECT data FROM profiles WHERE person_id = ?').get(scope);
  const data = existing ? parse(existing.data, {}) : {};
  data.answers = { ...(data.answers || {}), ...clean };
  db.prepare(`INSERT INTO profiles (person_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(person_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(scope, JSON.stringify(data), now());
  return data.answers;
}

// Seeds known facts from the initial brief (run once, when setup completes).
function seedKnownFacts(db) {
  const seeds = seedAnswers();
  for (const [personId, answers] of Object.entries(seeds)) {
    const current = getProfiles(db)[personId] || {};
    const merged = { ...answers, ...current };
    saveAnswers(db, personId, merged);
  }
  for (const m of SEED_MEMORIES) {
    createMemory(db, { scope: m.scope, person_id: m.person_id, kind: 'lasting', effect: 'note', text: m.text, source: 'initial brief' });
  }
}

// ---------- recipes ----------

function rowToRecipe(r) {
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    meal_types: parse(r.meal_types, []),
    active_minutes: r.active_minutes,
    total_minutes: r.total_minutes,
    servings: r.servings,
    ingredients: parse(r.ingredients, []),
    steps: parse(r.steps, []),
    air_fryer: r.air_fryer,
    storage_notes: r.storage_notes,
    nutrition: parse(r.nutrition, null),
    tags: parse(r.tags, []),
    notes: r.notes,
    enabled: !!r.enabled,
    updated_at: r.updated_at,
  };
}

function cleanRecipe(input, existing = {}) {
  const v = { ...existing, ...input };
  const name = String(v.name || '').trim();
  if (!name || name.length > 120) throw new HttpError(400, 'Recipe name is required (max 120 characters).');
  const mealTypes = (Array.isArray(v.meal_types) ? v.meal_types : []).filter((s) => SLOTS.includes(s));
  if (!mealTypes.length) throw new HttpError(400, `Choose at least one meal type: ${SLOTS.join(', ')}.`);
  // Text fields from the form take precedence over stored structured values.
  const ingredients = input.ingredients_text !== undefined
    ? parseIngredientLines(input.ingredients_text)
    : (Array.isArray(v.ingredients) ? v.ingredients.map((i) => (typeof i === 'string' ? parseIngredientLine(i) : i)).filter(Boolean) : []);
  const steps = input.steps_text !== undefined
    ? String(input.steps_text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : (Array.isArray(v.steps) ? v.steps.map((s) => String(s).trim()).filter(Boolean) : []);
  const intOrNull = (x) => (x === null || x === undefined || x === '' ? null : Math.max(0, Math.round(Number(x))));
  const servings = Math.max(1, Math.round(Number(v.servings) || 2));
  let nutrition = v.nutrition || null;
  if (nutrition) {
    nutrition = {
      per: 'serving',
      energy_kcal: nutrition.energy_kcal ?? null,
      protein_g: nutrition.protein_g ?? null,
      carbs_g: nutrition.carbs_g ?? null,
      fat_g: nutrition.fat_g ?? null,
      fiber_g: nutrition.fiber_g ?? null,
      source: nutrition.source ? String(nutrition.source).slice(0, 200) : 'entered by household',
      uncertainty: ['low', 'medium', 'high'].includes(nutrition.uncertainty) ? nutrition.uncertainty : 'high',
    };
  }
  const tags = Array.isArray(v.tags) ? v.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  return {
    name,
    cuisine: v.cuisine ? String(v.cuisine).slice(0, 60) : null,
    meal_types: mealTypes,
    active_minutes: intOrNull(v.active_minutes),
    total_minutes: intOrNull(v.total_minutes),
    servings,
    ingredients,
    steps,
    air_fryer: v.air_fryer ? String(v.air_fryer).slice(0, 500) : null,
    storage_notes: v.storage_notes ? String(v.storage_notes).slice(0, 500) : null,
    nutrition,
    tags,
    notes: v.notes ? String(v.notes).slice(0, 2000) : null,
    enabled: v.enabled === false ? 0 : 1,
  };
}

function listRecipes(db, { includeDisabled = false } = {}) {
  const rows = db.prepare(`SELECT * FROM recipes ${includeDisabled ? '' : 'WHERE enabled = 1'} ORDER BY name`).all();
  return rows.map(rowToRecipe);
}

function getRecipe(db, id) {
  const r = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!r) throw new HttpError(404, 'Recipe not found.');
  const recipe = rowToRecipe(r);
  recipe.outcomes = db.prepare(`SELECT o.id, o.cooked_on, o.rating, o.notes, o.modifications, p.name AS person
    FROM recipe_outcomes o LEFT JOIN people p ON p.id = o.person_id WHERE o.recipe_id = ? ORDER BY o.cooked_on DESC, o.id DESC LIMIT 20`).all(id);
  return recipe;
}

function createRecipe(db, input) {
  const v = cleanRecipe(input);
  const t = now();
  const info = db.prepare(`INSERT INTO recipes (name, cuisine, meal_types, active_minutes, total_minutes, servings, ingredients, steps,
    air_fryer, storage_notes, nutrition, tags, notes, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    v.name, v.cuisine, json(v.meal_types, '[]'), v.active_minutes, v.total_minutes, v.servings, json(v.ingredients, '[]'),
    json(v.steps, '[]'), v.air_fryer, v.storage_notes, json(v.nutrition, null), json(v.tags, '[]'), v.notes, v.enabled, t, t);
  return getRecipe(db, Number(info.lastInsertRowid));
}

// Adds the starter set, skipping any recipe whose name already exists.
function addStarterRecipes(db) {
  const { STARTER_RECIPES } = require('./starter-recipes');
  const existing = new Set(db.prepare('SELECT LOWER(name) AS n FROM recipes').all().map((r) => r.n));
  let added = 0;
  for (const r of STARTER_RECIPES) {
    if (existing.has(r.name.toLowerCase())) continue;
    createRecipe(db, { ...r, ingredients_text: r.ingredients_text, steps_text: r.steps_text });
    added++;
  }
  return added;
}

function updateRecipe(db, id, input) {
  const current = getRecipe(db, id);
  const v = cleanRecipe(input, { ...current, tags: current.tags });
  db.prepare(`UPDATE recipes SET name=?, cuisine=?, meal_types=?, active_minutes=?, total_minutes=?, servings=?, ingredients=?,
    steps=?, air_fryer=?, storage_notes=?, nutrition=?, tags=?, notes=?, enabled=?, updated_at=? WHERE id=?`).run(
    v.name, v.cuisine, json(v.meal_types, '[]'), v.active_minutes, v.total_minutes, v.servings, json(v.ingredients, '[]'),
    json(v.steps, '[]'), v.air_fryer, v.storage_notes, json(v.nutrition, null), json(v.tags, '[]'), v.notes, v.enabled, now(), id);
  return getRecipe(db, id);
}

function deleteRecipe(db, id) {
  getRecipe(db, id);
  db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
}

function addOutcome(db, recipeId, input) {
  getRecipe(db, recipeId);
  const rating = input.rating === null || input.rating === undefined || input.rating === '' ? null : Number(input.rating);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating must be 1 to 5.');
  const personId = input.person_id || null;
  if (personId && !db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)) throw new HttpError(400, 'Unknown person.');
  // Modifications are recorded against the outcome only. The recipe itself is never overwritten silently.
  db.prepare(`INSERT INTO recipe_outcomes (recipe_id, person_id, cooked_on, rating, notes, modifications, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(recipeId, personId, input.cooked_on || todayIn(input.tz || 'UTC'), rating,
    input.notes ? String(input.notes).slice(0, 1000) : null, input.modifications ? String(input.modifications).slice(0, 1000) : null, now());
  if (input.save_as_memory && input.notes) {
    createMemory(db, {
      scope: personId ? 'person' : 'household', person_id: personId, kind: 'lasting', effect: 'note',
      recipe_id: recipeId, text: `${getRecipe(db, recipeId).name}: ${String(input.notes).slice(0, 300)}`, source: 'cooking feedback',
    });
  }
  return getRecipe(db, recipeId);
}

// ---------- memories ----------

function listMemories(db) {
  return db.prepare(`SELECT m.*, p.name AS person_name, r.name AS recipe_name FROM memories m
    LEFT JOIN people p ON p.id = m.person_id LEFT JOIN recipes r ON r.id = m.recipe_id ORDER BY m.active DESC, m.created_at DESC`).all()
    .map((m) => ({ ...m, active: !!m.active }));
}

function createMemory(db, input) {
  const scope = input.scope === 'person' ? 'person' : 'household';
  const personId = scope === 'person' ? input.person_id : null;
  if (scope === 'person' && !db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)) throw new HttpError(400, 'Choose a person for a person memory.');
  const kind = input.kind === 'one_time' ? 'one_time' : 'lasting';
  const effect = ['note', 'avoid_recipe', 'avoid_ingredient'].includes(input.effect) ? input.effect : 'note';
  const text = String(input.text || '').trim();
  if (!text) throw new HttpError(400, 'Memory text is required.');
  let recipeId = null;
  let keyword = null;
  if (effect === 'avoid_recipe') {
    recipeId = Number(input.recipe_id);
    if (!db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(recipeId)) throw new HttpError(400, 'Choose a recipe to avoid.');
  }
  if (effect === 'avoid_ingredient') {
    keyword = norm(input.keyword);
    if (!keyword) throw new HttpError(400, 'Give the ingredient keyword to avoid, e.g. "chicken".');
  }
  let expires = null;
  if (kind === 'one_time') {
    expires = input.expires_on || todayIn(input.tz || 'UTC');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new HttpError(400, 'expires_on must be YYYY-MM-DD.');
  }
  const t = now();
  const info = db.prepare(`INSERT INTO memories (scope, person_id, kind, effect, recipe_id, keyword, text, source, expires_on, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(scope, personId, kind, effect, recipeId, keyword, text.slice(0, 500),
    input.source ? String(input.source).slice(0, 60) : 'manual', expires, t, t);
  return Number(info.lastInsertRowid);
}

function updateMemory(db, id, input) {
  const m = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
  if (!m) throw new HttpError(404, 'Memory not found.');
  const text = input.text !== undefined ? String(input.text).trim().slice(0, 500) : m.text;
  if (!text) throw new HttpError(400, 'Memory text cannot be empty.');
  const active = input.active !== undefined ? (input.active ? 1 : 0) : m.active;
  db.prepare('UPDATE memories SET text = ?, active = ?, updated_at = ? WHERE id = ?').run(text, active, now(), id);
}

function deleteMemory(db, id) {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

// Rules that apply to one recipe on one date: returns hard exclusions and soft warnings.
function evaluateRecipe(recipe, date, ctx) {
  const haystack = [recipe.name, ...(recipe.tags || []), ...recipe.ingredients.map((i) => i.name)].join(' ').toLowerCase();
  const exclusions = [];
  const warnings = [];

  // Allergies are hard exclusions (safety).
  for (const { personName, allergies } of ctx.allergies) {
    for (const a of allergies) {
      if (haystack.includes(a.toLowerCase())) exclusions.push(`${personName} is allergic to ${a}`);
    }
  }
  // Memories: lasting rules always apply; one-time rules apply only on their date.
  for (const m of ctx.memories) {
    if (!m.active) continue;
    if (m.kind === 'one_time' && m.expires_on !== date) continue;
    if (m.effect === 'avoid_recipe' && m.recipe_id === recipe.id) exclusions.push(`Memory: ${m.text}`);
    if (m.effect === 'avoid_ingredient' && m.keyword && haystack.includes(m.keyword)) exclusions.push(`Memory: ${m.text}`);
  }
  // Dislikes are warnings only, because the household shares meals.
  for (const { personName, dislikes } of ctx.dislikes) {
    for (const d of dislikes) {
      if (haystack.includes(d.toLowerCase())) warnings.push(`${personName} dislikes ${d}`);
    }
  }
  // Weekday cooking-time limit: only enforced when both values are known.
  const dow = weekdayOf(date);
  if (ctx.weekdayLimit && dow >= 1 && dow <= 5) {
    if (recipe.total_minutes === null) warnings.push('Total time not recorded; check against the weekday limit');
    else if (recipe.total_minutes > ctx.weekdayLimit) exclusions.push(`Takes ${recipe.total_minutes} min; weekday limit is ${ctx.weekdayLimit} min`);
  }
  return { exclusions, warnings };
}

function planContext(db) {
  const profiles = getProfiles(db);
  const household = getHousehold(db);
  const ppl = people(db);
  const allergies = [];
  const dislikes = [];
  for (const p of ppl) {
    const a = profiles[p.id] || {};
    const list = (v) => (Array.isArray(v) ? v : []).filter((x) => !['none', 'not sure', ''].includes(norm(x)));
    allergies.push({ personName: p.name, allergies: list(a.allergies) });
    dislikes.push({ personName: p.name, dislikes: [...list(a.dislikes), ...list(a.additional_dislikes)] });
  }
  const memories = db.prepare('SELECT * FROM memories').all().map((m) => ({ ...m, active: !!m.active }));
  const limit = Number(household.weekday_cook_minutes);
  return {
    profiles, household, people: ppl, allergies, dislikes, memories,
    weekdayLimit: Number.isFinite(limit) && limit > 0 ? limit : null,
  };
}

// Generates (or fills) a month of plan entries. Refuses until onboarding is complete.
function generatePlan(db, month, { overwrite = false, tz = 'UTC' } = {}) {
  const status = onboarding(db);
  if (!status.complete) {
    throw new HttpError(423, 'Finish onboarding before generating the plan.', { missing: status.missing });
  }
  const dates = monthDates(month);
  const recipes = listRecipes(db).filter((r) => r.meal_types.length);
  const ctx = planContext(db);
  const start = dates[0];

  // Days since each recipe was last used, seeded from the week before the month.
  const lastUsed = new Map();
  const dayIndex = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  for (const r of db.prepare('SELECT plan_date, recipe_id FROM plan_entries WHERE plan_date >= ? AND plan_date < ? AND recipe_id IS NOT NULL')
    .all(addDays(start, -7), start)) {
    lastUsed.set(r.recipe_id, Math.max(lastUsed.get(r.recipe_id) ?? -999, dayIndex(r.plan_date)));
  }
  const existing = new Map(db.prepare('SELECT * FROM plan_entries WHERE plan_date >= ? AND plan_date <= ?')
    .all(start, dates[dates.length - 1]).map((e) => [`${e.plan_date}|${e.slot}`, e]));

  let filled = 0;
  let empty = 0;
  for (const date of dates) {
    const idx = dayIndex(date);
    for (const slot of SLOTS) {
      const ex = existing.get(`${date}|${slot}`);
      if (ex && (ex.locked || (!overwrite && ex.recipe_id))) {
        if (ex.recipe_id) lastUsed.set(ex.recipe_id, idx);
        continue;
      }
      const evaluated = recipes.filter((r) => r.meal_types.includes(slot)).map((r) => ({ r, ...evaluateRecipe(r, date, ctx) }));
      const allowed = evaluated.filter((e) => e.exclusions.length === 0);
      const fresh = allowed.filter((e) => idx - (lastUsed.get(e.r.id) ?? -999) > RECENT_WINDOW_DAYS);
      const pool = fresh.length ? fresh : allowed;
      pool.sort((a, b) => (lastUsed.get(a.r.id) ?? -999) - (lastUsed.get(b.r.id) ?? -999) || a.r.id - b.r.id);
      let recipeId = null;
      let reason;
      if (pool.length) {
        const pick = pool[0];
        recipeId = pick.r.id;
        const why = fresh.length ? 'rotated in for variety' : 'only option that fits the rules';
        lastUsed.set(recipeId, idx);
        reason = [`Fits ${slot}; ${why}`, ...pick.warnings].join('. ');
        filled++;
      } else {
        const blocked = evaluated.flatMap((e) => e.exclusions).slice(0, 2).join('; ');
        reason = slot === 'snack'
          ? 'Optional: no snack recipes yet'
          : recipes.some((r) => r.meal_types.includes(slot))
            ? `No recipe fits the rules today${blocked ? ` (${blocked})` : ''}`
            : `No ${slot} recipes in the library yet`;
        empty++;
      }
      db.prepare(`INSERT INTO plan_entries (plan_date, slot, recipe_id, reason, locked) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(plan_date, slot) DO UPDATE SET recipe_id = excluded.recipe_id, reason = excluded.reason`)
        .run(date, slot, recipeId, reason);
    }
  }
  return { month, filled, empty, days: dates.length, tz };
}

function getPlan(db, month) {
  const dates = monthDates(month);
  const ctx = planContext(db);
  const rows = db.prepare(`SELECT e.*, r.name AS recipe_name FROM plan_entries e LEFT JOIN recipes r ON r.id = e.recipe_id
    WHERE e.plan_date >= ? AND e.plan_date <= ? ORDER BY e.plan_date, e.slot`).all(dates[0], dates[dates.length - 1]);
  const recipesById = new Map(listRecipes(db, { includeDisabled: true }).map((r) => [r.id, r]));
  const entries = rows.map((e) => {
    const recipe = e.recipe_id ? recipesById.get(e.recipe_id) : null;
    let warnings = [];
    if (recipe) {
      const ev = evaluateRecipe(recipe, e.plan_date, ctx);
      warnings = [...ev.exclusions.map((x) => `Conflict: ${x}`), ...ev.warnings];
    }
    return { id: e.id, date: e.plan_date, slot: e.slot, recipe_id: e.recipe_id, recipe_name: e.recipe_name, locked: !!e.locked, reason: e.reason, warnings };
  });
  return { month, entries, onboarding: onboarding(db) };
}

function updatePlanEntry(db, id, input) {
  const e = db.prepare('SELECT * FROM plan_entries WHERE id = ?').get(id);
  if (!e) throw new HttpError(404, 'Plan entry not found.');
  let recipeId = e.recipe_id;
  if (input.recipe_id !== undefined) {
    recipeId = input.recipe_id === null ? null : Number(input.recipe_id);
    if (recipeId !== null && !db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(recipeId)) throw new HttpError(400, 'Unknown recipe.');
  }
  const locked = input.locked !== undefined ? (input.locked ? 1 : 0) : e.locked;
  const reason = recipeId !== e.recipe_id ? 'Chosen by household' : e.reason;
  db.prepare('UPDATE plan_entries SET recipe_id = ?, locked = ?, reason = ? WHERE id = ?').run(recipeId, locked, reason, id);
  const month = e.plan_date.slice(0, 7);
  const plan = getPlan(db, month);
  return plan.entries.find((x) => x.id === id);
}

// ---------- pantry ----------

function listPantry(db) {
  return db.prepare('SELECT * FROM pantry_items ORDER BY normalized, unit').all();
}

function upsertPantry(db, { name, quantity, unit = '', status = 'confirmed', mode = 'set' }) {
  const n = norm(name);
  if (!n) throw new HttpError(400, 'Item name is required.');
  const q = Number(quantity);
  if (!Number.isFinite(q) || q < 0) throw new HttpError(400, 'Quantity must be zero or more.');
  const u = norm(unit);
  const existing = db.prepare('SELECT * FROM pantry_items WHERE normalized = ? AND unit = ?').get(n, u);
  if (existing) {
    const next = mode === 'add' ? existing.quantity + q : q;
    db.prepare('UPDATE pantry_items SET quantity = ?, status = ?, updated_at = ? WHERE id = ?').run(next, status, now(), existing.id);
    return existing.id;
  }
  const info = db.prepare('INSERT INTO pantry_items (name, normalized, quantity, unit, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(String(name).trim().slice(0, 120), n, q, u, status, now());
  return Number(info.lastInsertRowid);
}

function updatePantry(db, id, input) {
  const p = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(id);
  if (!p) throw new HttpError(404, 'Pantry item not found.');
  const quantity = input.quantity !== undefined ? Number(input.quantity) : p.quantity;
  if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, 'Quantity must be zero or more.');
  const status = ['confirmed', 'estimated'].includes(input.status) ? input.status : p.status;
  db.prepare('UPDATE pantry_items SET quantity = ?, status = ?, updated_at = ? WHERE id = ?').run(quantity, status, now(), id);
}

function deletePantry(db, id) {
  db.prepare('DELETE FROM pantry_items WHERE id = ?').run(id);
}

// Pasted grocery list or receipt lines: "2 cup rice", "500 g chicken", "1 garlic".
// Quantities add to existing stock; the household should review the result.
function importPantryText(db, text, status) {
  const lines = parseIngredientLines(text);
  if (!lines.length) throw new HttpError(400, 'No items found. Put one item per line, e.g. "500 g chicken".');
  const st = status === 'estimated' ? 'estimated' : 'confirmed';
  for (const l of lines) upsertPantry(db, { name: l.name, quantity: l.quantity, unit: l.unit, status: st, mode: 'add' });
  return lines.length;
}

// Proposed deductions for a cooked meal. Nothing changes until confirmed.
function cookProposal(db, recipeId, servings) {
  const recipe = getRecipe(db, recipeId);
  const factor = servings && recipe.servings ? Number(servings) / recipe.servings : 1;
  const pantry = listPantry(db);
  const lines = recipe.ingredients.map((ing) => {
    const need = Math.round(ing.quantity * factor * 100) / 100;
    const base = { ingredient: ing.name, unit: ing.unit, needed: need };
    if (!need) return { ...base, status: 'no_quantity', pantry_id: null, have: null, proposed: 0 };
    const exact = pantry.find((p) => p.normalized === norm(ing.name) && p.unit === norm(ing.unit));
    if (exact) {
      const proposed = Math.min(need, exact.quantity);
      return { ...base, status: exact.quantity >= need ? 'matched' : 'short', pantry_id: exact.id, pantry_name: exact.name, have: exact.quantity, proposed };
    }
    const sameName = pantry.find((p) => p.normalized === norm(ing.name));
    if (sameName) return { ...base, status: 'unit_mismatch', pantry_id: null, pantry_name: sameName.name, have: sameName.quantity, proposed: 0 };
    return { ...base, status: 'not_in_pantry', pantry_id: null, have: null, proposed: 0 };
  });
  return { recipe_id: recipe.id, recipe_name: recipe.name, servings: servings || recipe.servings, lines };
}

// Applies confirmed (possibly corrected) deductions and logs them for undo.
function cookConfirm(db, { recipe_id: recipeId, servings, deductions, cooked_on: cookedOn }) {
  const recipe = recipeId ? getRecipe(db, recipeId) : null;
  const date = cookedOn || todayIn('UTC');
  const applied = [];
  db.exec('BEGIN');
  try {
    for (const d of Array.isArray(deductions) ? deductions : []) {
      const q = Number(d.quantity);
      if (!d.pantry_id || !Number.isFinite(q) || q <= 0) continue;
      const p = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(d.pantry_id);
      if (!p) continue;
      const after = Math.max(0, p.quantity - q);
      db.prepare('UPDATE pantry_items SET quantity = ?, updated_at = ? WHERE id = ?').run(after, now(), p.id);
      applied.push({ pantry_id: p.id, name: p.name, unit: p.unit, before: p.quantity, after, deducted: p.quantity - after });
    }
    const info = db.prepare('INSERT INTO cook_logs (recipe_id, recipe_name, cooked_on, deductions, undone, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .run(recipe ? recipe.id : null, recipe ? recipe.name : 'Unnamed meal', date, JSON.stringify({ servings: servings || null, applied }), now());
    db.exec('COMMIT');
    return { id: Number(info.lastInsertRowid), applied };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function undoCook(db, id) {
  const log = db.prepare('SELECT * FROM cook_logs WHERE id = ?').get(id);
  if (!log) throw new HttpError(404, 'Cooking log not found.');
  if (log.undone) throw new HttpError(409, 'Already undone.');
  const applied = parse(log.deductions, { applied: [] }).applied || [];
  db.exec('BEGIN');
  try {
    for (const a of applied) {
      const p = db.prepare('SELECT * FROM pantry_items WHERE id = ?').get(a.pantry_id);
      if (p) db.prepare('UPDATE pantry_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?').run(a.deducted, now(), p.id);
    }
    db.prepare('UPDATE cook_logs SET undone = 1 WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function listCookLogs(db) {
  return db.prepare('SELECT id, recipe_name, cooked_on, undone FROM cook_logs ORDER BY id DESC LIMIT 30').all().map((r) => ({ ...r, undone: !!r.undone }));
}

// ---------- missing ingredients and shopping ----------

// Ingredients needed by planned meals in [start, start+days) that the pantry does not cover.
function missingItems(db, start, days) {
  const end = addDays(start, days);
  const rows = db.prepare(`SELECT e.plan_date, r.id AS recipe_id, r.name AS recipe_name, r.ingredients FROM plan_entries e
    JOIN recipes r ON r.id = e.recipe_id WHERE e.plan_date >= ? AND e.plan_date < ?`).all(start, end);
  const needs = new Map();
  for (const row of rows) {
    for (const ing of parse(row.ingredients, [])) {
      if (!ing.quantity) continue; // unmeasured items (e.g. salt to taste) are not tracked
      const key = `${norm(ing.name)}|${norm(ing.unit)}`;
      const n = needs.get(key) || { name: ing.name, unit: norm(ing.unit), needed: 0, recipes: new Set() };
      n.needed += ing.quantity;
      n.recipes.add(row.recipe_name);
      needs.set(key, n);
    }
  }
  const pantry = new Map(listPantry(db).map((p) => [`${p.normalized}|${p.unit}`, p]));
  const out = [];
  for (const [key, n] of needs) {
    const have = pantry.get(key)?.quantity || 0;
    const missing = Math.round((n.needed - have) * 100) / 100;
    if (missing > 0) out.push({ name: n.name, unit: n.unit, needed: n.needed, have, missing, recipes: [...n.recipes] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function getShopping(db) {
  const lists = db.prepare('SELECT * FROM shopping_lists ORDER BY id').all();
  const items = db.prepare('SELECT * FROM shopping_items ORDER BY checked, normalized, unit').all();
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    items: items.filter((i) => i.list_id === l.id).map((i) => ({ ...i, checked: !!i.checked })),
  }));
}

function createShoppingList(db, name) {
  const n = String(name || '').trim().slice(0, 80) || 'Groceries';
  const info = db.prepare('INSERT INTO shopping_lists (name, created_at) VALUES (?, ?)').run(n, now());
  return Number(info.lastInsertRowid);
}

function addShoppingItem(db, listId, { name, quantity = 0, unit = '', source = 'manual' }) {
  if (!db.prepare('SELECT 1 FROM shopping_lists WHERE id = ?').get(listId)) throw new HttpError(404, 'Shopping list not found.');
  const n = norm(name);
  if (!n) throw new HttpError(400, 'Item name is required.');
  const q = Number(quantity) || 0;
  db.prepare(`INSERT INTO shopping_items (list_id, name, normalized, quantity, unit, checked, source, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).run(listId, String(name).trim().slice(0, 120), n, q, norm(unit), source, now());
}

function updateShoppingItem(db, id, input) {
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id);
  if (!item) throw new HttpError(404, 'Item not found.');
  const checked = input.checked !== undefined ? (input.checked ? 1 : 0) : item.checked;
  const quantity = input.quantity !== undefined ? Number(input.quantity) : item.quantity;
  if (!Number.isFinite(quantity) || quantity < 0) throw new HttpError(400, 'Quantity must be zero or more.');
  db.prepare('UPDATE shopping_items SET checked = ?, quantity = ?, updated_at = ? WHERE id = ?').run(checked, quantity, now(), id);
}

function deleteShoppingItem(db, id) {
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id);
}

// Adds the gap between plan and pantry to a list. Idempotent: plan-sourced rows are refreshed, not duplicated.
function addMissingToList(db, listId, start, days = 7) {
  if (!db.prepare('SELECT 1 FROM shopping_lists WHERE id = ?').get(listId)) throw new HttpError(404, 'Shopping list not found.');
  const missing = missingItems(db, start, days);
  db.exec('BEGIN');
  try {
    db.prepare("DELETE FROM shopping_items WHERE list_id = ? AND source = 'plan' AND checked = 0").run(listId);
    for (const m of missing) {
      const clash = db.prepare('SELECT 1 FROM shopping_items WHERE list_id = ? AND normalized = ? AND unit = ?').get(listId, norm(m.name), m.unit);
      if (clash) continue; // a manual entry already covers it
      addShoppingItem(db, listId, { name: m.name, quantity: m.missing, unit: m.unit, source: 'plan' });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return missing.length;
}

// Explicit action (never automatic): checked items move into the pantry and leave the list.
function moveCheckedToPantry(db, listId) {
  const checked = db.prepare('SELECT * FROM shopping_items WHERE list_id = ? AND checked = 1').all(listId);
  db.exec('BEGIN');
  try {
    for (const i of checked) {
      if (i.quantity > 0) upsertPantry(db, { name: i.name, quantity: i.quantity, unit: i.unit, status: 'confirmed', mode: 'add' });
      db.prepare('DELETE FROM shopping_items WHERE id = ?').run(i.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return checked.length;
}

// ---------- briefings and notifications ----------

function mealsOn(db, date) {
  return db.prepare(`SELECT e.slot, r.id AS recipe_id, r.name FROM plan_entries e LEFT JOIN recipes r ON r.id = e.recipe_id
    WHERE e.plan_date = ? ORDER BY CASE e.slot WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'dinner' THEN 3 ELSE 4 END`).all(date);
}

function briefing(db, tz, date = todayIn(tz)) {
  const tomorrow = addDays(date, 1);
  const fmt = (rows) => rows.length
    ? rows.map((r) => `${r.slot}: ${r.name || 'not planned yet'}`).join('; ')
    : 'No plan for this day yet';
  const todayMeals = mealsOn(db, date);
  const tomorrowMeals = mealsOn(db, tomorrow);
  const shopToday = missingItems(db, date, 1).map((m) => `${m.name} ${m.missing}${m.unit ? ' ' + m.unit : ''}`);
  const shopTomorrow = missingItems(db, tomorrow, 1).map((m) => `${m.name} ${m.missing}${m.unit ? ' ' + m.unit : ''}`);
  return {
    date,
    today: { meals: todayMeals, text: fmt(todayMeals), missing: shopToday },
    tomorrow: { date: tomorrow, meals: tomorrowMeals, text: fmt(tomorrowMeals), missing: shopTomorrow },
  };
}

// Creates a notification at most once per key. Called by the scheduler.
function notify(db, kind, dedupeKey, title, body) {
  db.prepare('INSERT OR IGNORE INTO notifications (kind, dedupe_key, title, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(kind, dedupeKey, title, body, now());
}

function runScheduledNotifications(db, tz, date = new Date()) {
  const { date: day, hour } = localParts(date, tz);
  if (hour >= 8) {
    const b = briefing(db, tz, day);
    const missing = b.today.missing.length ? ` Shopping: ${b.today.missing.join(', ')}.` : '';
    notify(db, 'briefing', `briefing:${day}`, 'Today’s menu', `${b.today.text}.${missing}`);
  }
  if (hour >= 20) {
    const b = briefing(db, tz, day);
    const missing = b.tomorrow.missing.length ? ` Buy before tomorrow: ${b.tomorrow.missing.join(', ')}.` : '';
    notify(db, 'prep', `prep:${day}`, 'Tomorrow’s prep', `${b.tomorrow.text}.${missing}`);
  }
}

function listNotifications(db) {
  return db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 50').all().map((n) => ({ ...n, read: !!n.read_at }));
}

function markNotificationsRead(db) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(now());
}

// ---------- feature requests ----------

function draftSpec(text) {
  const title = text.split(/[.!?\n]/)[0].trim().slice(0, 80) || 'Feature request';
  return [
    `# Draft specification: ${title}`,
    '',
    '## Request (verbatim)',
    text,
    '',
    '## Goal',
    '_To be confirmed with the requester._',
    '',
    '## Acceptance criteria',
    '- [ ] Behaviour described above works on iPhone Safari and on a laptop browser',
    '- [ ] Data is kept in the household database and is reviewable and editable',
    '- [ ] Tests cover the new logic',
    '',
    '## Open questions',
    '- Which household members should see or change this?',
    '',
    '## Rollout',
    'Branch, tests, preview, and explicit approval before anything reaches production.',
  ].join('\n');
}

function createFeatureRequest(db, personId, text) {
  const t = String(text || '').trim();
  if (t.length < 5) throw new HttpError(400, 'Describe the feature in a sentence or two.');
  const info = db.prepare('INSERT INTO feature_requests (requested_by, text, status, draft_spec, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(personId || null, t.slice(0, 2000), 'proposed', draftSpec(t.slice(0, 2000)), now());
  return Number(info.lastInsertRowid);
}

function listFeatureRequests(db) {
  return db.prepare(`SELECT f.*, p.name AS requested_by_name FROM feature_requests f LEFT JOIN people p ON p.id = f.requested_by ORDER BY f.id DESC`).all();
}

function updateFeatureRequest(db, id, status) {
  if (!['proposed', 'approved', 'in_progress', 'done', 'rejected'].includes(status)) throw new HttpError(400, 'Unknown status.');
  db.prepare('UPDATE feature_requests SET status = ? WHERE id = ?').run(status, id);
}

module.exports = {
  SLOTS, HttpError, localParts, todayIn, addDays, monthDates, parseIngredientLine, parseIngredientLines, norm,
  getHousehold, people, getProfiles, getProfile, onboarding, saveAnswers, seedKnownFacts,
  listRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe, addOutcome, cleanRecipe, addStarterRecipes,
  listMemories, createMemory, updateMemory, deleteMemory,
  generatePlan, getPlan, updatePlanEntry,
  listPantry, upsertPantry, updatePantry, deletePantry, importPantryText, cookProposal, cookConfirm, undoCook, listCookLogs,
  missingItems, getShopping, createShoppingList, addShoppingItem, updateShoppingItem, deleteShoppingItem, addMissingToList, moveCheckedToPantry,
  briefing, runScheduledNotifications, listNotifications, markNotificationsRead,
  createFeatureRequest, listFeatureRequests, updateFeatureRequest,
  isAnswered,
};
