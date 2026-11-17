/* Orby front end. Plain JavaScript, no build step. All user-entered text goes through esc() before it reaches the page. */
(() => {
  'use strict';

  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const TABS = [
    { id: 'today', label: 'Today' },
    { id: 'plan', label: 'Plan' },
    { id: 'recipes', label: 'Recipes' },
    { id: 'shop', label: 'Shop' },
    { id: 'pantry', label: 'Pantry' },
  ];
  const FEATURE_STATUSES = ['proposed', 'approved', 'in_progress', 'done', 'rejected'];

  const state = { status: null, pickedPerson: null, recipes: [], cookSteps: [], cookIndex: 0, cookProposal: null };
  const app = document.getElementById('app');
  const topbar = document.getElementById('topbar');
  const tabbar = document.getElementById('tabbar');

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const monthLocal = () => todayLocal().slice(0, 7);
  const addDaysStr = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
  const fmtDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  const fmtTs = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  const numOrNull = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v));
  const round1 = (n) => Math.round(n * 10) / 10;
  const slotLabel = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  async function api(method, url, data) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    };
    if (method !== 'GET') opts.body = JSON.stringify(data ?? {});
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw Object.assign(new Error('No connection. Check your network and try again.'), { status: 0 });
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      throw Object.assign(new Error((json && json.error) || `Request failed (${res.status}).`), {
        status: res.status, missing: json && json.missing,
      });
    }
    return json;
  }

  function toast(message, opts = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (opts.error ? ' error' : '');
    el.setAttribute('role', opts.error ? 'alert' : 'status');
    el.textContent = message;
    if (opts.undo) {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.type = 'button';
      b.dataset.action = 'undo-cook';
      b.dataset.id = String(opts.undo);
      b.textContent = 'Undo';
      el.appendChild(b);
    }
    const stack = $('#toasts');
    while (stack.children.length >= 2) stack.firstElementChild.remove(); // keep at most two on screen
    stack.appendChild(el);
    setTimeout(() => el.remove(), opts.undo ? 9000 : 4500);
  }

  // Scroll to the top only when the screen changes, so toggles and saves keep your place.
  let lastHash = null;
  const show = (html) => {
    app.innerHTML = html;
    if (location.hash !== lastHash) window.scrollTo(0, 0);
    lastHash = location.hash;
  };
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
  const errorBlock = (e) => `<div class="notice error" role="alert">${esc(e.message || 'Something went wrong.')}</div><p><a href="#/today">Back to today</a></p>`;

  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, q = ''] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(q)) };
  }

  // ---------- chrome ----------
  function renderChrome(activeHead) {
    const s = state.status;
    const signedIn = !!(s && s.setup_done && s.signed_in);
    tabbar.hidden = !signedIn;
    topbar.innerHTML = `<a class="brand" href="#/today">Orby<small>Kitchen</small></a>` + (signedIn
      ? `<div class="row"><span class="muted small-text">${esc(s.signed_in.name)}</span><a class="btn small" href="#/more">More</a></div>`
      : '');
    if (signedIn) {
      tabbar.innerHTML = TABS.map((t) => `<a class="tab" href="#/${t.id}"${t.id === activeHead ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
    }
  }

  // ---------- boot and routing ----------
  async function boot() {
    try {
      state.status = await api('GET', '/api/status');
    } catch (e) {
      show(errorBlock(e));
      return;
    }
    renderChrome();
    route();
  }

  async function route() {
    try {
      const s = state.status;
      if (!s.setup_done) return renderSetup();
      if (!s.signed_in) return renderLogin();
      const { parts, query } = parseRoute();
      const [head = 'today', id, sub] = parts;
      renderChrome(head === 'recipes' || head === 'shop' || head === 'pantry' || head === 'plan' || head === 'today' ? head : null);
      switch (head) {
        case 'today': return await viewToday();
        case 'plan': return await viewPlan(query.m);
        case 'recipes':
          if (!id) return await viewRecipes();
          if (id === 'new') return await viewRecipeForm(null);
          if (sub === 'edit') return await viewRecipeForm(Number(id));
          if (sub === 'cook') return await viewCook(Number(id), query.s);
          return await viewRecipe(Number(id));
        case 'shop': return await viewShop();
        case 'pantry': return await viewPantry();
        case 'more': return await viewMore();
        case 'profiles': return await viewProfiles();
        case 'memory': return await viewMemory();
        case 'requests': return await viewRequests();
        case 'notifications': return await viewNotifications();
        default: return go('#/today');
      }
    } catch (e) {
      if (e.status === 401) {
        state.status = await api('GET', '/api/status').catch(() => state.status);
        return route();
      }
      show(errorBlock(e));
    }
  }

  // ---------- setup and sign-in ----------
  function renderSetup() {
    renderChrome();
    show(`
      <h1>Welcome to Orby</h1>
      <p class="muted">First-time setup. Asha and Prabha each choose a PIN of 4 to 8 digits. Facts from your initial brief are added to the profiles, and you can edit every one of them.</p>
      <form class="card" data-form="setup">
        <div class="field"><label class="label" for="pin-asha">Asha's PIN</label>
          <input id="pin-asha" class="pin" name="asha" type="password" inputmode="numeric" autocomplete="new-password" minlength="4" maxlength="8" required></div>
        <div class="field"><label class="label" for="pin-prabha">Prabha's PIN</label>
          <input id="pin-prabha" class="pin" name="prabha" type="password" inputmode="numeric" autocomplete="new-password" minlength="4" maxlength="8" required></div>
        <button class="btn primary block" type="submit">Create household</button>
      </form>`);
  }

  function renderLogin() {
    renderChrome();
    const picked = state.pickedPerson && state.status.people.find((p) => p.id === state.pickedPerson);
    if (picked) {
      return show(`
        <h1>Hi ${esc(picked.name)}</h1>
        <form class="card" data-form="login">
          <input type="hidden" name="person_id" value="${esc(picked.id)}">
          <div class="field"><label class="label" for="pin">Your PIN</label>
            <input id="pin" class="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required autofocus></div>
          <button class="btn primary block" type="submit">Sign in</button>
          <p><button class="btn small" type="button" data-action="pick-person" data-id="">Not ${esc(picked.name)}?</button></p>
        </form>`);
    }
    show(`
      <h1>Who's signing in?</h1>
      <p class="muted">Orby is shared by the household. Each person signs in with their own PIN.</p>
      <div class="people">${state.status.people.map((p) =>
        `<button class="btn person-btn" type="button" data-action="pick-person" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>`);
  }

  // ---------- today ----------
  function mealsList(meals, date) {
    if (!meals.length) return `<p class="muted">No menu planned for ${esc(fmtDate(date))} yet. <a href="#/plan">Open the plan</a>.</p>`;
    return `<div class="items">${meals.map((m) => `
      <div class="item">
        <div class="main"><div class="slot">${esc(slotLabel(m.slot))}</div>
          ${m.recipe_id ? `<a href="#/recipes/${m.recipe_id}"><strong>${esc(m.name)}</strong></a>` : '<span class="muted">Not planned yet</span>'}</div>
        ${m.recipe_id && (m.slot === 'lunch' || m.slot === 'dinner') ? `<div class="actions"><a class="btn small" href="#/recipes/${m.recipe_id}/cook">Cook</a></div>` : ''}
      </div>`).join('')}</div>`;
  }

  function missingHtml(list) {
    if (!list.length) return '<p class="muted">Nothing missing: the pantry covers these meals.</p>';
    return `<ul class="small-text">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  }

  async function viewToday() {
    const [b, ob, notes] = await Promise.all([api('GET', '/api/briefing'), api('GET', '/api/onboarding'), api('GET', '/api/notifications')]);
    const gate = ob.status.complete ? '' : `<div class="notice">${ob.status.missing.length} onboarding item(s) open. <a href="#/profiles">Finish onboarding</a> to unlock the monthly plan.</div>`;
    const recent = notes.slice(0, 3);
    show(`
      <h1>${esc(fmtDate(b.date))}</h1>
      ${gate}
      <section class="card">
        <div class="section-head"><h2>Today's menu</h2><a class="small-text" href="#/plan">Plan</a></div>
        ${mealsList(b.today.meals, b.date)}
      </section>
      <section class="card">
        <h2>Shopping for today</h2>
        ${missingHtml(b.today.missing)}
        ${b.today.missing.length ? '<button class="btn primary" type="button" data-action="add-missing">Add to shopping list (next 7 days)</button>' : ''}
      </section>
      <section class="card">
        <h2>Tomorrow</h2>
        ${mealsList(b.tomorrow.meals, b.tomorrow.date)}
        ${b.tomorrow.missing.length ? `<h3>Buy before tomorrow</h3>${missingHtml(b.tomorrow.missing)}` : ''}
      </section>
      <section class="card">
        <div class="section-head"><h2>Reminders</h2><a class="small-text" href="#/notifications">All</a></div>
        ${recent.length ? `<div class="items">${recent.map((n) => `<div class="item"><div class="main"><strong>${esc(n.title)}</strong>${n.read ? '' : ' <span class="badge ok">new</span>'}<div class="small-text">${esc(n.body)}</div></div></div>`).join('')}</div>`
          : '<p class="muted">No reminders yet. Briefings arrive at 08:00 and prep reminders at 20:00.</p>'}
      </section>`);
  }

  // ---------- plan ----------
  async function viewPlan(monthParam) {
    const m = /^\d{4}-\d{2}$/.test(monthParam || '') ? monthParam : monthLocal();
    const [plan, recipes] = await Promise.all([api('GET', `/api/plan?month=${m}`), api('GET', '/api/recipes')]);
    state.recipes = recipes;
    const byKey = new Map(plan.entries.map((e) => [`${e.date}|${e.slot}`, e]));
    const dates = [...new Set(plan.entries.map((e) => e.date))].sort();
    const open = plan.onboarding.missing.length;
    const gate = plan.onboarding.complete ? '' : `<div class="notice">Plan generation is locked until onboarding is complete (${open} open). <a href="#/profiles">Finish onboarding</a></div>`;
    const recipeOptions = (selectedId) => `<option value="">— none —</option>${recipes.map((r) =>
      `<option value="${r.id}"${r.id === selectedId ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}`;

    const dayBlock = (date) => `
      <div class="day"><h3>${esc(fmtDate(date))}</h3>
        <div class="items">${SLOTS.map((slot) => {
          const e = byKey.get(`${date}|${slot}`);
          if (!e) return '';
          const prev = byKey.get(`${addDaysStr(date, -1)}|${slot}`);
          const warnings = e.warnings.map((w) => `<div class="notice small-text">${esc(w)}</div>`).join('');
          return `
          <div class="item">
            <div class="main">
              <div class="slot">${esc(slotLabel(slot))}${e.locked ? ' · locked' : ''}</div>
              <div>${e.recipe_name ? esc(e.recipe_name) : '<span class="muted">Empty</span>'}</div>
              ${warnings}
              ${e.reason ? `<div class="muted small-text">${esc(e.reason)}</div>` : ''}
              <label class="label" for="swap-${e.id}">Change meal</label>
              <select id="swap-${e.id}" data-change="swap" data-id="${e.id}">${recipeOptions(e.recipe_id)}</select>
            </div>
            <div class="actions">
              <button class="btn small" type="button" data-action="toggle-lock" data-id="${e.id}" data-locked="${!e.locked}">${e.locked ? 'Unlock' : 'Lock'}</button>
              ${prev && prev.recipe_id && prev.recipe_id !== e.recipe_id
                ? `<button class="btn small" type="button" data-action="repeat" data-id="${e.id}" data-recipe="${prev.recipe_id}">Repeat yesterday</button>` : ''}
            </div>
          </div>`;
        }).join('')}</div>
      </div>`;

    show(`
      <h1>Plan · ${esc(monthLabel(m))}</h1>
      <div class="row">
        <a class="btn small" href="#/plan?m=${shiftMonth(m, -1)}">← Previous</a>
        <div class="spacer"></div>
        <a class="btn small" href="#/plan?m=${shiftMonth(m, 1)}">Next →</a>
      </div>
      ${gate}
      <div class="row mt">
        <button class="btn primary grow" type="button" data-action="gen-fill" data-month="${m}">Fill empty slots</button>
        <button class="btn grow" type="button" data-action="gen-all" data-month="${m}">Regenerate unlocked</button>
      </div>
      <p class="muted small-text">Locked meals are never changed. Regenerating replaces unlocked meals using only recipes in your library. Conflicts show as warnings; you can still choose a meal.</p>
      ${dates.length ? dates.map(dayBlock).join('') : `<div class="empty">No plan for ${esc(monthLabel(m))} yet. ${recipes.length ? 'Press "Fill empty slots" to create it.' : 'Add a few recipes first, then generate the plan.'}</div>`}`);
  }

  async function generate(month, overwrite) {
    try {
      const r = await api('POST', '/api/plan/generate', { month, overwrite });
      toast(`Filled ${r.filled} slot(s). ${r.empty} still empty.`);
      route();
    } catch (e) {
      if (e.status === 423) {
        toast(`Finish onboarding first: ${e.missing.length} item(s) open.`, { error: true });
        go('#/profiles');
      } else {
        toast(e.message, { error: true });
      }
    }
  }

  // ---------- recipes ----------
  function recipeRow(r) {
    return `<div class="item" data-name="${esc(r.name.toLowerCase())}">
      <div class="main">
        <a href="#/recipes/${r.id}"><strong>${esc(r.name)}</strong></a>${r.enabled ? '' : ' <span class="badge">archived</span>'}
        <div class="muted small-text">${r.meal_types.map((s) => esc(slotLabel(s))).join(', ')} · ${r.total_minutes != null ? `${r.total_minutes} min` : 'time not set'} · serves ${esc(r.servings)}</div>
      </div></div>`;
  }

  async function viewRecipes() {
    const recipes = await api('GET', '/api/recipes?all=1');
    show(`
      <div class="row"><h1 class="grow">Recipes</h1><a class="btn primary" href="#/recipes/new">Add recipe</a></div>
      ${recipes.length ? '<input type="search" placeholder="Search recipes" data-input="filter-recipes" aria-label="Search recipes" class="mt-s">' : ''}
      <section class="card items" id="recipe-list">
        ${recipes.length ? recipes.map(recipeRow).join('') : `<div class="empty">No recipes yet.<br><span class="small-text">Orby does not ship a recipe catalogue. Add the recipes your household cooks, and the monthly plan will use only those.</span></div>`}
      </section>`);
  }

  async function viewRecipe(id) {
    const [r, profiles, people] = await Promise.all([api('GET', `/api/recipes/${id}`), api('GET', '/api/profiles'), api('GET', '/api/people')]);
    const n = r.nutrition;
    const nutrition = n
      ? `<ul class="small-text">${[
          n.energy_kcal != null && `Energy: ${n.energy_kcal} kcal`,
          n.protein_g != null && `Protein: ${n.protein_g} g`,
          n.carbs_g != null && `Carbs: ${n.carbs_g} g`,
          n.fat_g != null && `Fat: ${n.fat_g} g`,
          n.fiber_g != null && `Fibre: ${n.fiber_g} g`,
        ].filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="muted small-text">Per serving. Source: ${esc(n.source)}. Uncertainty: ${esc(n.uncertainty)}.</p>`
      : '<p class="muted">No nutrition estimate yet. Add one from a label or trusted source when you have it.</p>';
    const portions = people.map((p) => {
      const f = profiles[p.id]?.portion_factor;
      if (typeof f !== 'number') return `<li>${esc(p.name)}: portion size not set yet (answer it in Profiles)</li>`;
      const protein = n && n.protein_g != null ? ` · about ${round1(n.protein_g * f)} g protein (estimate, ${esc(n.uncertainty)} uncertainty)` : '';
      return `<li>${esc(p.name)}: ${esc(f)}× a standard serving${protein}</li>`;
    }).join('');
    const outcomes = r.outcomes.length ? `<div class="items">${r.outcomes.map((o) => `
      <div class="item"><div class="main">
        <div>${o.rating ? '★'.repeat(o.rating) + '☆'.repeat(5 - o.rating) : ''} <span class="muted small-text">${esc(o.person || 'Household')} · ${esc(o.cooked_on)}</span></div>
        ${o.notes ? `<div class="small-text">${esc(o.notes)}</div>` : ''}
        ${o.modifications ? `<div class="small-text"><strong>Changed:</strong> ${esc(o.modifications)}</div>` : ''}
      </div></div>`).join('')}</div>` : '<p class="muted">No feedback yet.</p>';

    show(`
      <div class="row"><h1 class="grow">${esc(r.name)}</h1></div>
      <p class="muted">${r.meal_types.map((s) => esc(slotLabel(s))).join(', ')}${r.cuisine ? ` · ${esc(r.cuisine)}` : ''}${!r.enabled ? ' · archived' : ''}</p>
      <div class="row">
        <a class="btn primary" href="#/recipes/${r.id}/cook">Cook this</a>
        <a class="btn" href="#/recipes/${r.id}/edit">Edit</a>
        <button class="btn" type="button" data-action="recipe-archive" data-id="${r.id}" data-enabled="${!r.enabled}">${r.enabled ? 'Archive' : 'Restore'}</button>
        <button class="btn danger" type="button" data-action="recipe-delete" data-id="${r.id}">Delete</button>
      </div>
      <section class="card">
        <h2>Time and servings</h2>
        <p>${r.active_minutes != null ? `Active ${r.active_minutes} min · ` : ''}Total ${r.total_minutes != null ? `${r.total_minutes} min` : 'not recorded'} · Serves ${esc(r.servings)}</p>
        <h3>Per person</h3>
        <ul class="small-text">${portions}</ul>
      </section>
      <section class="card">
        <h2>Ingredients</h2>
        <ul>${r.ingredients.map((i) => `<li>${esc(i.text || `${i.quantity || ''} ${i.unit || ''} ${i.name}`.trim())}</li>`).join('') || '<li class="muted">None listed</li>'}</ul>
      </section>
      <section class="card">
        <h2>Method</h2>
        <ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">No steps yet</li>'}</ol>
        ${r.air_fryer ? `<h3>Air fryer</h3><p>${esc(r.air_fryer)}</p>` : ''}
        ${r.storage_notes ? `<h3>Storage and safety</h3><p>${esc(r.storage_notes)}</p>` : ''}
        ${r.notes ? `<h3>Notes</h3><p>${esc(r.notes)}</p>` : ''}
      </section>
      <section class="card"><h2>Nutrition estimate</h2>${nutrition}</section>
      <section class="card">
        <h2>Feedback</h2>
        ${outcomes}
        <details><summary>Add feedback</summary>
          <form data-form="outcome" data-id="${r.id}">
            <div class="field"><label class="label" for="o-rating">Rating</label>
              <select id="o-rating" name="rating"><option value="">No rating</option>${[1, 2, 3, 4, 5].map((v) => `<option value="${v}">${v} / 5</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="o-person">Who</label>
              <select id="o-person" name="person_id"><option value="">Household</option>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="o-notes">What happened</label><textarea id="o-notes" name="notes" rows="2"></textarea></div>
            <div class="field"><label class="label" for="o-mods">What you changed (kept with this feedback; the recipe itself is not changed)</label><textarea id="o-mods" name="modifications" rows="2"></textarea></div>
            <label class="check"><input type="checkbox" name="save_as_memory"> Also remember this note for future plans</label>
            <button class="btn primary block" type="submit">Save feedback</button>
          </form>
        </details>
      </section>`);
  }

  async function viewRecipeForm(id) {
    const r = id ? await api('GET', `/api/recipes/${id}`) : null;
    const n = (r && r.nutrition) || {};
    const types = r ? r.meal_types : [];
    const linesOf = (items, fmt) => (items || []).map(fmt).join('\n');
    show(`
      <h1>${r ? 'Edit recipe' : 'New recipe'}</h1>
      <form class="card" data-form="recipe" data-id="${r ? r.id : ''}">
        <div class="field"><label class="label" for="r-name">Name</label><input id="r-name" name="name" required maxlength="120" value="${esc(r ? r.name : '')}"></div>
        <div class="field"><span class="label">Meal types</span>
          <div class="row">${SLOTS.map((s) => `<label class="check"><input type="checkbox" name="meal_types" value="${s}"${types.includes(s) ? ' checked' : ''}> ${esc(slotLabel(s))}</label>`).join('')}</div></div>
        <div class="grid2">
          <div class="field"><label class="label" for="r-total">Total minutes</label><input id="r-total" name="total_minutes" type="number" min="0" inputmode="numeric" value="${esc(r && r.total_minutes != null ? r.total_minutes : '')}"></div>
          <div class="field"><label class="label" for="r-active">Active minutes</label><input id="r-active" name="active_minutes" type="number" min="0" inputmode="numeric" value="${esc(r && r.active_minutes != null ? r.active_minutes : '')}"></div>
        </div>
        <div class="field"><label class="label" for="r-serves">Serves (standard servings)</label><input id="r-serves" name="servings" type="number" min="1" value="${esc(r ? r.servings : 2)}"></div>
        <div class="field"><label class="label" for="r-ing">Ingredients, one per line</label>
          <textarea id="r-ing" name="ingredients_text" rows="6" placeholder="500 g chicken&#10;1 tbsp garlic paste&#10;salt to taste">${esc(linesOf(r && r.ingredients, (i) => i.text || `${i.quantity || ''} ${i.unit || ''} ${i.name}`.trim()))}</textarea>
          <span class="muted small-text">Quantities with units (g, ml, cup, tbsp, tsp, piece, clove) let Orby check the pantry. Items without a quantity are not tracked.</span></div>
        <div class="field"><label class="label" for="r-steps">Steps, one per line</label>
          <textarea id="r-steps" name="steps_text" rows="6">${esc(linesOf(r && r.steps, (s) => s))}</textarea></div>
        <div class="field"><label class="label" for="r-af">Air fryer settings (optional)</label>
          <input id="r-af" name="air_fryer" maxlength="500" value="${esc(r && r.air_fryer ? r.air_fryer : '')}" placeholder="e.g. 180 °C, 12 min, shake halfway"></div>
        <div class="field"><label class="label" for="r-storage">Storage and safety (optional)</label>
          <input id="r-storage" name="storage_notes" maxlength="500" value="${esc(r && r.storage_notes ? r.storage_notes : '')}"></div>
        <div class="field"><label class="label" for="r-notes">Notes</label><textarea id="r-notes" name="notes" rows="2">${esc(r && r.notes ? r.notes : '')}</textarea></div>
        <details${r && r.nutrition ? ' open' : ''}><summary>Nutrition estimate (optional, per serving)</summary>
          <div class="grid2">
            <div class="field"><label class="label" for="n-p">Protein (g)</label><input id="n-p" name="protein_g" type="number" step="any" min="0" value="${esc(n.protein_g ?? '')}"></div>
            <div class="field"><label class="label" for="n-e">Energy (kcal)</label><input id="n-e" name="energy_kcal" type="number" step="any" min="0" value="${esc(n.energy_kcal ?? '')}"></div>
            <div class="field"><label class="label" for="n-c">Carbs (g)</label><input id="n-c" name="carbs_g" type="number" step="any" min="0" value="${esc(n.carbs_g ?? '')}"></div>
            <div class="field"><label class="label" for="n-f">Fat (g)</label><input id="n-f" name="fat_g" type="number" step="any" min="0" value="${esc(n.fat_g ?? '')}"></div>
            <div class="field"><label class="label" for="n-fi">Fibre (g)</label><input id="n-fi" name="fiber_g" type="number" step="any" min="0" value="${esc(n.fiber_g ?? '')}"></div>
            <div class="field"><label class="label" for="n-u">Uncertainty</label>
              <select id="n-u" name="uncertainty">${['low', 'medium', 'high'].map((u) => `<option${(n.uncertainty || 'high') === u ? ' selected' : ''}>${u}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label class="label" for="n-s">Source (label, database, or "estimated by household")</label><input id="n-s" name="source" maxlength="200" value="${esc(n.source ?? '')}"></div>
        </details>
        <label class="check"><input type="checkbox" name="enabled"${!r || r.enabled ? ' checked' : ''}> Available for the plan</label>
        <div class="row mt">
          <button class="btn primary grow" type="submit">Save recipe</button>
          <a class="btn" href="${r ? `#/recipes/${r.id}` : '#/recipes'}">Cancel</a>
        </div>
      </form>`);
  }

  async function viewCook(id, servingsParam) {
    const r = await api('GET', `/api/recipes/${id}`);
    const servings = Number(servingsParam) || r.servings;
    const proposal = await api('POST', '/api/cook/proposal', { recipe_id: id, servings });
    state.cookProposal = proposal;
    state.cookSteps = r.steps;
    state.cookIndex = 0;
    const statusLabel = {
      matched: 'In stock', short: 'Not enough in stock', unit_mismatch: 'Unit differs; deduct manually',
      not_in_pantry: 'Not in pantry', no_quantity: 'No quantity to deduct',
    };
    const rows = proposal.lines.map((l) => {
      const have = l.have == null ? '—' : `${esc(l.have)} ${esc(l.unit)}`;
      const need = l.needed ? `${esc(l.needed)} ${esc(l.unit)}` : 'to taste';
      if (l.pantry_id) {
        return `<tr><td>${esc(l.ingredient)}<div class="muted small-text">${esc(statusLabel[l.status])}</div></td>
          <td>${need}</td><td>${have}</td>
          <td><input type="number" min="0" step="any" inputmode="decimal" data-pantry-id="${l.pantry_id}" value="${esc(l.proposed)}" aria-label="Deduct ${esc(l.ingredient)}"></td></tr>`;
      }
      return `<tr><td>${esc(l.ingredient)}<div class="muted small-text">${esc(statusLabel[l.status])}</div></td><td>${need}</td><td>${have}</td><td>—</td></tr>`;
    }).join('');

    show(`
      <h1>Cook · ${esc(r.name)}</h1>
      <form class="card" data-form="cook-servings" data-id="${r.id}">
        <div class="row">
          <div class="field grow"><label class="label" for="servings">Servings cooked</label>
            <input id="servings" name="servings" type="number" min="1" step="1" inputmode="numeric" value="${esc(servings)}"></div>
          <button class="btn" type="submit">Recalculate</button>
        </div>
        <p class="muted small-text">${r.active_minutes != null ? `Active ${esc(r.active_minutes)} min · ` : ''}Total ${r.total_minutes != null ? `${esc(r.total_minutes)} min` : 'time not recorded'}</p>
      </form>
      ${r.air_fryer ? `<div class="notice">Air fryer: ${esc(r.air_fryer)}</div>` : ''}
      ${r.storage_notes ? `<p class="small-text"><strong>Storage:</strong> ${esc(r.storage_notes)}</p>` : ''}
      <section class="card">
        <h2>Method</h2>
        <div id="step-panel">${stepPanelHtml()}</div>
      </section>
      <section class="card">
        <h2>Pantry</h2>
        <p class="muted">Proposed deductions come from current stock. Change any amount, then confirm. Nothing changes until you confirm.</p>
        <form data-form="cook-confirm" data-id="${r.id}">
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Ingredient</th><th>Needed</th><th>In stock</th><th>Deduct</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" class="muted">No measured ingredients to track.</td></tr>'}</tbody>
          </table></div>
          <button class="btn primary block mt" type="submit">Confirm cooked and update pantry</button>
        </form>
      </section>`);
  }

  function stepPanelHtml() {
    const steps = state.cookSteps;
    if (!steps.length) return '<p class="muted">No steps recorded.</p>';
    const i = state.cookIndex;
    return `
      <div class="step current"><div class="n">${i + 1}</div><div>${esc(steps[i])}</div></div>
      <div class="row mt">
        <button class="btn" type="button" data-action="step" data-dir="-1" ${i === 0 ? 'disabled' : ''}>← Back</button>
        <div class="spacer"></div>
        <span class="muted small-text">Step ${i + 1} of ${steps.length}</span>
        <div class="spacer"></div>
        <button class="btn primary" type="button" data-action="step" data-dir="1" ${i >= steps.length - 1 ? 'disabled' : ''}>Next step →</button>
      </div>`;
  }

  // ---------- pantry ----------
  function pantryRow(p) {
    return `<div class="item">
      <div class="main"><strong>${esc(p.name)}</strong> <span class="badge ${p.status === 'confirmed' ? 'ok' : 'warn'}">${esc(p.status)}</span>
        <div class="muted small-text">${esc(p.quantity)} ${esc(p.unit)}</div></div>
      <div class="actions">
        <form class="row" data-form="pantry-edit" data-id="${p.id}">
          <input class="narrow" name="quantity" type="number" min="0" step="any" inputmode="decimal" value="${esc(p.quantity)}" aria-label="Quantity of ${esc(p.name)}">
          <select name="status" class="narrow" aria-label="Status of ${esc(p.name)}">
            <option value="confirmed"${p.status === 'confirmed' ? ' selected' : ''}>Confirmed</option>
            <option value="estimated"${p.status === 'estimated' ? ' selected' : ''}>Estimated</option>
          </select>
          <button class="btn small" type="submit">Save</button>
        </form>
        <button class="btn small danger" type="button" data-action="pantry-delete" data-id="${p.id}">Delete</button>
      </div></div>`;
  }

  async function viewPantry() {
    const [items, logs] = await Promise.all([api('GET', '/api/pantry'), api('GET', '/api/cook/logs')]);
    show(`
      <h1>Pantry</h1>
      <p class="muted">Amounts are what you enter. Estimated amounts are marked as such. The app does not weigh food, and camera or receipt scanning is not available yet.</p>
      <section class="card items">${items.length ? items.map(pantryRow).join('') : '<div class="empty">Nothing in the pantry yet.</div>'}</section>
      <section class="card">
        <h2>Add item</h2>
        <form data-form="pantry-add" class="stack">
          <div class="field"><label class="label" for="pa-name">Item</label><input id="pa-name" name="name" required maxlength="120" placeholder="e.g. chicken"></div>
          <div class="grid2">
            <div class="field"><label class="label" for="pa-q">Quantity</label><input id="pa-q" name="quantity" type="number" min="0" step="any" inputmode="decimal" required></div>
            <div class="field"><label class="label" for="pa-u">Unit</label><input id="pa-u" name="unit" maxlength="20" placeholder="g, ml, cup, piece"></div>
          </div>
          <div class="field"><label class="label" for="pa-s">Status</label>
            <select id="pa-s" name="status"><option value="confirmed">Confirmed (counted)</option><option value="estimated">Estimated (rough)</option></select></div>
          <button class="btn primary block" type="submit">Add to pantry</button>
        </form>
      </section>
      <section class="card">
        <h2>Paste a grocery list or receipt</h2>
        <p class="muted small-text">One item per line, e.g. "500 g chicken" or "2 cup rice". Quantities are added to stock; review the result afterwards.</p>
        <form data-form="pantry-import" class="stack">
          <textarea name="text" rows="5" aria-label="Items to add" required></textarea>
          <div class="field"><label class="label" for="pi-s">Mark these as</label>
            <select id="pi-s" name="status"><option value="confirmed">Confirmed</option><option value="estimated">Estimated</option></select></div>
          <button class="btn block" type="submit">Add these items</button>
        </form>
      </section>
      <section class="card">
        <h2>Recent cooking</h2>
        ${logs.length ? `<div class="items">${logs.map((l) => `
          <div class="item"><div class="main"><strong>${esc(l.recipe_name)}</strong> <span class="muted small-text">${esc(l.cooked_on)}</span>${l.undone ? ' <span class="badge">undone</span>' : ''}</div>
          ${l.undone ? '' : `<div class="actions"><button class="btn small" type="button" data-action="undo-cook" data-id="${l.id}">Undo deductions</button></div>`}</div>`).join('')}</div>`
          : '<p class="muted">No cooked meals logged yet.</p>'}
      </section>`);
  }

  // ---------- shopping ----------
  function shopList(l) {
    const items = l.items.map((i) => `
      <div class="item ${i.checked ? 'strike' : ''}">
        <label class="check main"><input type="checkbox" data-change="toggle-item" data-id="${i.id}"${i.checked ? ' checked' : ''}>
          <span class="name">${esc(i.name)}</span>${i.quantity ? ` <span class="muted small-text">${esc(i.quantity)} ${esc(i.unit)}</span>` : ''}</label>
        <div class="actions">${i.source === 'plan' ? '<span class="badge">from plan</span>' : ''}
          <button class="btn small danger" type="button" data-action="item-delete" data-id="${i.id}">Remove</button></div>
      </div>`).join('');
    return `
      <section class="card">
        <h2>${esc(l.name)}</h2>
        <div class="items">${items || '<div class="empty">Empty list</div>'}</div>
        <div class="row mt">
          <button class="btn" type="button" data-action="list-from-plan" data-id="${l.id}">Add missing from plan (7 days)</button>
          <button class="btn" type="button" data-action="list-to-pantry" data-id="${l.id}">Move checked to pantry</button>
        </div>
        <form class="row mt" data-form="shop-add" data-id="${l.id}">
          <input class="grow" name="name" placeholder="Add item" required maxlength="120" aria-label="Item name">
          <input class="narrow" name="quantity" type="number" min="0" step="any" inputmode="decimal" placeholder="Qty" aria-label="Quantity">
          <input class="narrow" name="unit" placeholder="Unit" maxlength="20" aria-label="Unit">
          <button class="btn" type="submit">Add</button>
        </form>
        <details><summary>Paste a list</summary>
          <form data-form="shop-import" data-id="${l.id}" class="stack">
            <textarea name="text" rows="4" placeholder="One item per line, e.g. 2 onion" aria-label="Items to add"></textarea>
            <button class="btn" type="submit">Add items</button>
          </form>
        </details>
      </section>`;
  }

  async function viewShop() {
    const lists = await api('GET', '/api/shopping');
    show(`
      <h1>Shopping</h1>
      ${lists.length ? '' : '<div class="empty">No list yet. Create one below, or use "Add missing from plan" on Today.</div>'}
      ${lists.map(shopList).join('')}
      <section class="card">
        <h2>New list</h2>
        <form data-form="list-create" class="row">
          <input class="grow" name="name" placeholder="e.g. This week" required maxlength="80" aria-label="List name">
          <button class="btn primary" type="submit">Create</button>
        </form>
      </section>`);
  }

  // ---------- profiles and onboarding ----------
  function fieldHtml(f, value, idPrefix = 'f') {
    const id = `${idPrefix}_${f.key}`;
    const label = `<label class="label" for="${id}">${esc(f.label)}</label>`;
    if (f.type === 'list') {
      const v = Array.isArray(value) ? value.join('\n') : (value ?? '');
      return `<div class="field">${label}<textarea id="${id}" name="${esc(f.key)}" data-type="list" rows="2">${esc(v)}</textarea></div>`;
    }
    if (f.type === 'number') {
      return `<div class="field">${label}<input id="${id}" name="${esc(f.key)}" data-type="number" type="number" step="any" inputmode="decimal" value="${esc(value ?? '')}"></div>`;
    }
    return `<div class="field">${label}<textarea id="${id}" name="${esc(f.key)}" data-type="text" rows="2">${esc(value ?? '')}</textarea></div>`;
  }

  // Keys not in the schema (for example, facts from the brief) are shown too, typed by their current value.
  function extraFields(known, answers) {
    return Object.keys(answers || {}).filter((k) => !known.has(k)).map((k) => {
      const v = answers[k];
      const type = Array.isArray(v) ? 'list' : typeof v === 'number' ? 'number' : 'text';
      const label = k.replace(/_/g, ' ');
      return fieldHtml({ key: k, label: label.charAt(0).toUpperCase() + label.slice(1), type }, v, 'x');
    }).join('');
  }

  // Onboarding status banner. Updated in place after a save so other forms keep what was typed.
  function statusHtml(status) {
    if (status.complete) return '<div class="notice ok">Onboarding complete. You can generate the monthly plan.</div>';
    const openList = status.missing.map((m) => `<li>${esc(m.label)}</li>`).join('');
    return `<div class="notice">${status.missing.length} item(s) to answer before the plan unlocks. Type "none" or "not sure" where that is true.</div>
      <details><summary>Open items</summary><ul class="small-text">${openList}</ul></details>`;
  }

  async function viewProfiles() {
    const ob = await api('GET', '/api/onboarding');
    const { status, household, profiles, schema } = ob;
    const people = state.status.people;
    const householdKeys = new Set(schema.household.map((f) => f.key));
    const householdExtra = extraFields(householdKeys, household);
    show(`
      <h1>Profiles</h1>
      <div id="onb-status">${statusHtml(status)}</div>
      <section class="card">
        <h2>Household</h2>
        <form data-form="onboarding" data-scope="household">
          ${schema.household.map((f) => fieldHtml(f, household[f.key])).join('')}
          ${householdExtra}
          <button class="btn primary block" type="submit">Save household</button>
        </form>
      </section>
      ${people.map((p) => {
        const answers = profiles[p.id] || {};
        const keys = new Set([...schema.person, ...(schema.person_extra[p.id] || [])].map((f) => f.key));
        return `
        <section class="card">
          <h2>${esc(p.name)}</h2>
          <form data-form="onboarding" data-scope="${esc(p.id)}">
            ${[...schema.person, ...(schema.person_extra[p.id] || [])].map((f) => fieldHtml(f, answers[f.key], p.id)).join('')}
            ${extraFields(keys, answers)}
            <button class="btn primary block" type="submit">Save ${esc(p.name)}</button>
          </form>
        </section>`;
      }).join('')}`);
  }

  // ---------- memory ----------
  function memoryRow(m) {
    const meta = [
      m.scope === 'person' ? (m.person_name || 'Person') : 'Household',
      m.kind === 'one_time' ? `one-time${m.expires_on ? ` (${m.expires_on})` : ''}` : 'lasting',
      m.effect === 'note' ? 'note' : m.effect === 'avoid_recipe' ? `avoid: ${m.recipe_name || 'recipe'}` : `avoid ingredient: ${m.keyword}`,
      m.source,
    ].filter(Boolean).join(' · ');
    return `<div class="item ${m.active ? '' : 'strike'}">
      <div class="main"><div>${esc(m.text)}</div><div class="muted small-text">${esc(meta)}</div></div>
      <div class="actions">
        <button class="btn small" type="button" data-action="memory-toggle" data-id="${m.id}" data-active="${!m.active}">${m.active ? 'Pause' : 'Resume'}</button>
        <button class="btn small" type="button" data-action="memory-edit" data-id="${m.id}" data-text="${esc(m.text)}">Edit</button>
        <button class="btn small danger" type="button" data-action="memory-delete" data-id="${m.id}">Delete</button>
      </div></div>`;
  }

  async function viewMemory() {
    const [mems, recipes, people] = await Promise.all([api('GET', '/api/memories'), api('GET', '/api/recipes?all=1'), api('GET', '/api/people')]);
    show(`
      <h1>Memory</h1>
      <p class="muted">What Orby remembers about the household and each person. Lasting rules apply every time. One-time rules apply only on their date. Edit, pause or delete any of them.</p>
      <section class="card items">${mems.length ? mems.map(memoryRow).join('') : '<div class="empty">No memories yet.</div>'}</section>
      <section class="card">
        <h2>Add a memory</h2>
        <form data-form="memory-add" class="stack">
          <div class="field"><label class="label" for="m-text">What should Orby remember?</label><textarea id="m-text" name="text" rows="2" required maxlength="500"></textarea></div>
          <div class="grid2">
            <div class="field"><label class="label" for="m-scope">For</label>
              <select id="m-scope" name="scope"><option value="household">Household</option><option value="person">One person</option></select></div>
            <div class="field"><label class="label" for="m-person">Person</label>
              <select id="m-person" name="person_id"><option value="">—</option>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>
            <div class="field"><label class="label" for="m-kind">Kind</label>
              <select id="m-kind" name="kind"><option value="lasting">Lasting preference</option><option value="one_time">One-time (this date only)</option></select></div>
            <div class="field"><label class="label" for="m-date">Date (one-time only)</label><input id="m-date" name="expires_on" type="date"></div>
            <div class="field"><label class="label" for="m-effect">Effect on the plan</label>
              <select id="m-effect" name="effect"><option value="note">Note only</option><option value="avoid_ingredient">Avoid an ingredient</option><option value="avoid_recipe">Avoid a recipe</option></select></div>
            <div class="field"><label class="label" for="m-kw">Ingredient keyword</label><input id="m-kw" name="keyword" placeholder="e.g. chicken"></div>
          </div>
          <div class="field"><label class="label" for="m-recipe">Recipe (for "avoid a recipe")</label>
            <select id="m-recipe" name="recipe_id"><option value="">—</option>${recipes.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
          <button class="btn primary block" type="submit">Save memory</button>
        </form>
      </section>`);
  }

  // ---------- feature requests ----------
  async function viewRequests() {
    const reqs = await api('GET', '/api/feature-requests');
    show(`
      <h1>Feature requests</h1>
      <p class="muted">Describe a change in plain words. Orby records it and drafts a specification. Nothing is deployed until it has been reviewed, tested, and approved.</p>
      <section class="card">
        <form data-form="feature-add" class="stack">
          <label class="label" for="fr-text">What should Orby do?</label>
          <textarea id="fr-text" name="text" rows="3" required minlength="5" maxlength="2000" placeholder="e.g. Show tomorrow's shopping list on the Today screen"></textarea>
          <button class="btn primary block" type="submit">Record request</button>
        </form>
      </section>
      ${reqs.length ? reqs.map((r) => `
        <section class="card">
          <div class="row"><strong class="grow">${esc(r.text)}</strong><span class="badge">${esc(r.status)}</span></div>
          <div class="muted small-text">${esc(r.requested_by_name || 'Unknown')} · ${esc(fmtTs(r.created_at))}</div>
          <details><summary>Draft specification</summary><pre>${esc(r.draft_spec)}</pre></details>
          <label class="label" for="fs-${r.id}">Status</label>
          <select id="fs-${r.id}" data-change="feature-status" data-id="${r.id}">
            ${FEATURE_STATUSES.map((s) => `<option value="${s}"${s === r.status ? ' selected' : ''}>${esc(s.replace('_', ' '))}</option>`).join('')}
          </select>
        </section>`).join('') : '<div class="empty">No requests yet.</div>'}`);
  }

  // ---------- notifications and more ----------
  async function viewNotifications() {
    const list = await api('GET', '/api/notifications');
    show(`
      <div class="row"><h1 class="grow">Reminders</h1><button class="btn small" type="button" data-action="notes-read">Mark all read</button></div>
      ${list.length ? `<section class="card items">${list.map((n) => `
        <div class="item"><div class="main"><strong>${esc(n.title)}</strong>${n.read ? '' : ' <span class="badge ok">new</span>'}
          <div class="small-text">${esc(n.body)}</div><div class="muted small-text">${esc(fmtTs(n.created_at))}</div></div></div>`).join('')}</section>`
        : '<div class="empty">No reminders yet. Briefings arrive at 08:00 and prep reminders at 20:00 in the household time zone.</div>'}`);
  }

  async function viewMore() {
    const s = state.status;
    show(`
      <h1>More</h1>
      <section class="card items">
        <div class="item"><a class="main" href="#/profiles">Profiles and onboarding</a></div>
        <div class="item"><a class="main" href="#/memory">Memory</a></div>
        <div class="item"><a class="main" href="#/requests">Feature requests</a></div>
        <div class="item"><a class="main" href="#/notifications">Reminders</a></div>
      </section>
      <section class="card">
        <h2>Change my PIN</h2>
        <form data-form="pin" class="stack">
          <div class="field"><label class="label" for="pin-cur">Current PIN</label><input id="pin-cur" name="current_pin" type="password" inputmode="numeric" required></div>
          <div class="field"><label class="label" for="pin-new">New PIN (4 to 8 digits)</label><input id="pin-new" name="new_pin" type="password" inputmode="numeric" minlength="4" maxlength="8" required></div>
          <button class="btn block" type="submit">Change PIN</button>
        </form>
      </section>
      <section class="card">
        <h2>Session</h2>
        <button class="btn block" type="button" data-action="logout">Sign out</button>
      </section>
      <p class="muted small-text">Briefing time zone: ${esc(s.tz)}. Orby Kitchen is the first module; WhatsApp, Alexa and device integrations are not connected yet.</p>`);
  }

  // ---------- actions (clicks) ----------
  const actions = {
    'pick-person': async (el) => { state.pickedPerson = el.dataset.id || null; renderLogin(); },
    logout: async () => {
      await api('POST', '/api/logout', {});
      state.status = await api('GET', '/api/status');
      state.pickedPerson = null;
      renderChrome();
      route();
    },
    'add-missing': async () => {
      const lists = await api('GET', '/api/shopping');
      const listId = lists.length ? lists[0].id : (await api('POST', '/api/shopping/lists', { name: 'Groceries' })).id;
      const r = await api('POST', `/api/shopping/lists/${listId}/from-plan`, { days: 7 });
      toast(`Shopping list updated: ${r.added} missing item(s).`);
      go('#/shop');
    },
    'gen-fill': async (el) => generate(el.dataset.month, false),
    'gen-all': async (el) => { if (confirm('Replace the unlocked meals in this month?')) await generate(el.dataset.month, true); },
    'toggle-lock': async (el) => { await api('PATCH', `/api/plan/entries/${el.dataset.id}`, { locked: el.dataset.locked === 'true' }); route(); },
    repeat: async (el) => { await api('PATCH', `/api/plan/entries/${el.dataset.id}`, { recipe_id: Number(el.dataset.recipe) }); toast('Repeated yesterday’s meal.'); route(); },
    'recipe-archive': async (el) => { await api('PATCH', `/api/recipes/${el.dataset.id}`, { enabled: el.dataset.enabled === 'true' }); route(); },
    'recipe-delete': async (el) => {
      if (!confirm('Delete this recipe? Plan slots that use it will become empty. Cooking history keeps the name.')) return;
      await api('DELETE', `/api/recipes/${el.dataset.id}`);
      toast('Recipe deleted.');
      go('#/recipes');
    },
    step: async (el) => {
      state.cookIndex = Math.min(state.cookSteps.length - 1, Math.max(0, state.cookIndex + Number(el.dataset.dir)));
      const panel = document.getElementById('step-panel');
      if (panel) panel.innerHTML = stepPanelHtml();
    },
    'undo-cook': async (el) => {
      await api('POST', `/api/cook/${el.dataset.id}/undo`, {});
      toast('Pantry restored to before that cooking.');
      route();
    },
    'pantry-delete': async (el) => { if (confirm('Remove this item from the pantry?')) { await api('DELETE', `/api/pantry/${el.dataset.id}`); route(); } },
    'list-from-plan': async (el) => { const r = await api('POST', `/api/shopping/lists/${el.dataset.id}/from-plan`, { days: 7 }); toast(`${r.added} item(s) missing from the plan.`); route(); },
    'list-to-pantry': async (el) => {
      if (!confirm('Move checked items into the pantry and take them off the list?')) return;
      const r = await api('POST', `/api/shopping/lists/${el.dataset.id}/to-pantry`, {});
      toast(`${r.moved} item(s) moved to the pantry.`);
      route();
    },
    'item-delete': async (el) => { await api('DELETE', `/api/shopping/items/${el.dataset.id}`); route(); },
    'memory-toggle': async (el) => { await api('PATCH', `/api/memories/${el.dataset.id}`, { active: el.dataset.active === 'true' }); route(); },
    'memory-edit': async (el) => {
      const text = prompt('Edit this memory', el.dataset.text);
      if (text === null || !text.trim()) return;
      await api('PATCH', `/api/memories/${el.dataset.id}`, { text: text.trim() });
      route();
    },
    'memory-delete': async (el) => { if (confirm('Delete this memory?')) { await api('DELETE', `/api/memories/${el.dataset.id}`); route(); } },
    'notes-read': async () => { await api('POST', '/api/notifications/read', {}); route(); },
  };

  // ---------- forms (submits) ----------
  const listFrom = (raw) => String(raw || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  const forms = {
    setup: async (form) => {
      const fd = new FormData(form);
      await api('POST', '/api/setup', { pins: { asha: fd.get('asha'), prabha: fd.get('prabha') } });
      state.status = await api('GET', '/api/status');
      toast('Household created. Sign in to continue.');
      renderLogin();
    },
    login: async (form) => {
      const fd = new FormData(form);
      await api('POST', '/api/login', { person_id: fd.get('person_id'), pin: fd.get('pin') });
      state.pickedPerson = null;
      state.status = await api('GET', '/api/status');
      renderChrome();
      history.replaceState(null, '', '#/today'); // no hashchange event, so one render only
      route();
    },
    recipe: async (form) => {
      const fd = new FormData(form);
      const nutritionFields = ['protein_g', 'energy_kcal', 'carbs_g', 'fat_g', 'fiber_g'];
      const hasNutrition = nutritionFields.some((k) => String(fd.get(k) || '').trim() !== '') || String(fd.get('source') || '').trim() !== '';
      const nutrition = hasNutrition ? {
        protein_g: numOrNull(fd.get('protein_g')),
        energy_kcal: numOrNull(fd.get('energy_kcal')),
        carbs_g: numOrNull(fd.get('carbs_g')),
        fat_g: numOrNull(fd.get('fat_g')),
        fiber_g: numOrNull(fd.get('fiber_g')),
        source: fd.get('source') || 'entered by household',
        uncertainty: fd.get('uncertainty'),
      } : null;
      const payload = {
        name: fd.get('name'),
        meal_types: fd.getAll('meal_types'),
        total_minutes: numOrNull(fd.get('total_minutes')),
        active_minutes: numOrNull(fd.get('active_minutes')),
        servings: numOrNull(fd.get('servings')) || 2,
        ingredients_text: fd.get('ingredients_text'),
        steps_text: fd.get('steps_text'),
        air_fryer: fd.get('air_fryer'),
        storage_notes: fd.get('storage_notes'),
        notes: fd.get('notes'),
        enabled: fd.get('enabled') === 'on',
        nutrition,
      };
      const id = form.dataset.id;
      const saved = id ? await api('PATCH', `/api/recipes/${id}`, payload) : await api('POST', '/api/recipes', payload);
      toast('Recipe saved.');
      go(`#/recipes/${saved.id}`);
    },
    outcome: async (form) => {
      const fd = new FormData(form);
      await api('POST', `/api/recipes/${form.dataset.id}/outcomes`, {
        rating: numOrNull(fd.get('rating')),
        person_id: fd.get('person_id') || null,
        notes: fd.get('notes'),
        modifications: fd.get('modifications'),
        save_as_memory: fd.get('save_as_memory') === 'on',
      });
      toast('Feedback saved.');
      route();
    },
    'cook-servings': async (form) => {
      const servings = Number(new FormData(form).get('servings')) || 1;
      go(`#/recipes/${form.dataset.id}/cook?s=${servings}`);
    },
    'cook-confirm': async (form) => {
      const deductions = [...form.querySelectorAll('input[data-pantry-id]')]
        .map((i) => ({ pantry_id: Number(i.dataset.pantryId), quantity: Number(i.value) || 0 }))
        .filter((d) => d.quantity > 0);
      const log = await api('POST', '/api/cook/confirm', {
        recipe_id: Number(form.dataset.id),
        servings: state.cookProposal ? state.cookProposal.servings : null,
        deductions,
      });
      toast(`Logged. ${log.applied.length} pantry item(s) updated.`, { undo: log.id });
      go(`#/recipes/${form.dataset.id}`);
    },
    'pantry-add': async (form) => {
      const fd = new FormData(form);
      await api('POST', '/api/pantry', { name: fd.get('name'), quantity: Number(fd.get('quantity')), unit: fd.get('unit'), status: fd.get('status') });
      toast('Added to pantry.');
      route();
    },
    'pantry-edit': async (form) => {
      const fd = new FormData(form);
      await api('PATCH', `/api/pantry/${form.dataset.id}`, { quantity: Number(fd.get('quantity')), status: fd.get('status') });
      toast('Pantry updated.');
      route();
    },
    'pantry-import': async (form) => {
      const fd = new FormData(form);
      const r = await api('POST', '/api/pantry/import', { text: fd.get('text'), status: fd.get('status') });
      toast(`${r.imported} item(s) added. Please review quantities.`);
      route();
    },
    'list-create': async (form) => {
      await api('POST', '/api/shopping/lists', { name: new FormData(form).get('name') });
      route();
    },
    'shop-add': async (form) => {
      const fd = new FormData(form);
      await api('POST', `/api/shopping/lists/${form.dataset.id}/items`, { name: fd.get('name'), quantity: Number(fd.get('quantity')) || 0, unit: fd.get('unit') });
      route();
    },
    'shop-import': async (form) => {
      const r = await api('POST', `/api/shopping/lists/${form.dataset.id}/import`, { text: new FormData(form).get('text') });
      toast(`${r.added} item(s) added.`);
      route();
    },
    onboarding: async (form) => {
      const answers = {};
      for (const el of form.querySelectorAll('[name][data-type]')) {
        const raw = el.value;
        if (el.dataset.type === 'list') answers[el.name] = listFrom(raw);
        else if (el.dataset.type === 'number') answers[el.name] = raw.trim() === '' ? null : Number(raw);
        else answers[el.name] = raw.trim() === '' ? null : raw.trim();
      }
      const r = await api('PUT', `/api/onboarding/${form.dataset.scope}`, { answers });
      toast(r.status.complete ? 'Saved. Onboarding complete.' : `Saved. ${r.status.missing.length} item(s) still open.`);
      // Update the banner only; re-rendering would clear what the other forms still hold.
      const box = document.getElementById('onb-status');
      if (box) box.innerHTML = statusHtml(r.status);
      else route();
    },
    'memory-add': async (form) => {
      const fd = new FormData(form);
      const scope = fd.get('scope');
      await api('POST', '/api/memories', {
        text: fd.get('text'),
        scope,
        person_id: scope === 'person' ? fd.get('person_id') || null : null,
        kind: fd.get('kind'),
        expires_on: fd.get('kind') === 'one_time' ? fd.get('expires_on') || null : null,
        effect: fd.get('effect'),
        keyword: fd.get('keyword'),
        recipe_id: fd.get('recipe_id') ? Number(fd.get('recipe_id')) : null,
      });
      toast('Memory saved.');
      route();
    },
    'feature-add': async (form) => {
      await api('POST', '/api/feature-requests', { text: new FormData(form).get('text') });
      toast('Request recorded. A draft specification is attached.');
      route();
    },
    pin: async (form) => {
      const fd = new FormData(form);
      await api('POST', '/api/me/pin', { current_pin: fd.get('current_pin'), new_pin: fd.get('new_pin') });
      toast('PIN changed.');
      form.reset();
    },
  };

  // ---------- event wiring ----------
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    try {
      await fn(el);
    } catch (err) {
      if (err.status === 401) return boot();
      toast(err.message, { error: true });
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    const fn = forms[form.dataset.form];
    if (!fn) return;
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await fn(form);
    } catch (err) {
      if (err.status === 401) return boot();
      toast(err.message, { error: true });
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;
    const kind = el.dataset.change;
    if (!kind) return;
    try {
      if (kind === 'swap') {
        const entry = await api('PATCH', `/api/plan/entries/${el.dataset.id}`, { recipe_id: el.value ? Number(el.value) : null });
        if (entry.warnings && entry.warnings.length) toast(entry.warnings.join(' · '), { error: true });
        route();
      } else if (kind === 'toggle-item') {
        await api('PATCH', `/api/shopping/items/${el.dataset.id}`, { checked: el.checked });
        route();
      } else if (kind === 'feature-status') {
        await api('PATCH', `/api/feature-requests/${el.dataset.id}`, { status: el.value });
        toast('Status updated.');
      }
    } catch (err) {
      if (err.status === 401) return boot();
      toast(err.message, { error: true });
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset.input !== 'filter-recipes') return;
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#recipe-list > .item').forEach((it) => { it.hidden = !it.dataset.name.includes(q); });
  });

  window.addEventListener('hashchange', route);
  boot();
})();
