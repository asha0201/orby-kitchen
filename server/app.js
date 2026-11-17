'use strict';
// HTTP API for Orby. Every route except health, status, setup and login needs a signed-in household member.
const express = require('express');
const path = require('node:path');
const auth = require('./auth');
const d = require('./domain');
const { HOUSEHOLD_ITEMS, PERSON_ITEMS, PERSON_EXTRA_ITEMS } = require('./onboarding');

const COOKIE = 'orby_session';

function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    next();
  });

  const setupDone = () => db.prepare("SELECT COUNT(*) AS n FROM people WHERE pin_hash IS NOT NULL").get().n === 2;
  const cookieOptions = () => ({
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: auth.SESSION_DAYS * 86400000, secure: config.secureCookies,
  });

  // Attach the signed-in person to every request (null when signed out).
  app.use((req, res, next) => {
    const token = auth.parseCookies(req.headers.cookie)[COOKIE];
    req.person = auth.sessionPerson(db, token);
    req.token = token;
    next();
  });

  const requireUser = (req, res, next) => {
    if (!req.person) return res.status(401).json({ error: 'Sign in first.' });
    next();
  };

  // Writes need JSON, which blocks simple cross-site form posts.
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json') && req.headers['content-length'] !== '0') {
      return res.status(415).json({ error: 'Send JSON.' });
    }
    next();
  });

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const body = (req) => req.body || {};
  const id = (req) => Number(req.params.id);
  const tz = config.tz;
  const today = () => d.todayIn(tz);

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/api/status', (req, res) => {
    res.json({
      setup_done: setupDone(),
      people: d.people(db),
      signed_in: req.person,
      tz,
    });
  });

  // First-run only: sets both PINs and seeds the facts from the initial brief.
  app.post('/api/setup', wrap((req, res) => {
    if (setupDone()) return res.status(409).json({ error: 'Setup is already complete.' });
    const pins = body(req).pins || {};
    if (!auth.validPin(pins.asha) || !auth.validPin(pins.prabha)) {
      return res.status(400).json({ error: 'Each person needs a PIN of 4 to 8 digits.' });
    }
    if (pins.asha === pins.prabha) return res.status(400).json({ error: 'Choose different PINs.' });
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE people SET pin_hash = ? WHERE id = ?').run(auth.hashPin(pins.asha), 'asha');
      db.prepare('UPDATE people SET pin_hash = ? WHERE id = ?').run(auth.hashPin(pins.prabha), 'prabha');
      d.seedKnownFacts(db);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.status(201).json({ ok: true });
  }));

  app.post('/api/login', wrap((req, res) => {
    const { person_id: personId, pin } = body(req);
    if (!setupDone()) return res.status(409).json({ error: 'Set up Orby first.' });
    const result = auth.attemptLogin(db, personId, String(pin || ''));
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const token = auth.createSession(db, personId);
    res.cookie(COOKIE, token, cookieOptions());
    res.json({ ok: true, person: d.people(db).find((p) => p.id === personId) });
  }));

  app.post('/api/logout', (req, res) => {
    auth.deleteSession(db, req.token);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/me/pin', requireUser, wrap((req, res) => {
    const { current_pin: current, new_pin: next } = body(req);
    if (!auth.attemptLogin(db, req.person.id, String(current || '')).ok) {
      return res.status(401).json({ error: 'Current PIN is wrong.' });
    }
    if (!auth.validPin(next)) return res.status(400).json({ error: 'New PIN must be 4 to 8 digits.' });
    db.prepare('UPDATE people SET pin_hash = ? WHERE id = ?').run(auth.hashPin(next), req.person.id);
    res.json({ ok: true });
  }));

  app.use('/api', requireUser);

  app.get('/api/people', (req, res) => res.json(d.people(db)));

  app.get('/api/onboarding', (req, res) => {
    res.json({
      status: d.onboarding(db),
      household: d.getHousehold(db),
      profiles: d.getProfiles(db),
      schema: {
        household: HOUSEHOLD_ITEMS,
        person: PERSON_ITEMS,
        person_extra: PERSON_EXTRA_ITEMS,
      },
    });
  });

  app.put('/api/onboarding/:scope', wrap((req, res) => {
    const scope = req.params.scope;
    const saved = d.saveAnswers(db, scope, body(req).answers);
    res.json({ saved, status: d.onboarding(db) });
  }));

  app.get('/api/profiles', (req, res) => res.json(d.getProfiles(db)));

  app.get('/api/recipes', (req, res) => {
    res.json(d.listRecipes(db, { includeDisabled: req.query.all === '1' }));
  });
  app.post('/api/recipes', wrap((req, res) => res.status(201).json(d.createRecipe(db, body(req)))));
  app.get('/api/recipes/:id', wrap((req, res) => res.json(d.getRecipe(db, id(req)))));
  app.patch('/api/recipes/:id', wrap((req, res) => res.json(d.updateRecipe(db, id(req), body(req)))));
  app.delete('/api/recipes/:id', wrap((req, res) => { d.deleteRecipe(db, id(req)); res.json({ ok: true }); }));
  app.post('/api/recipes/:id/outcomes', wrap((req, res) => {
    res.status(201).json(d.addOutcome(db, id(req), { ...body(req), tz }));
  }));

  app.get('/api/memories', (req, res) => res.json(d.listMemories(db)));
  app.post('/api/memories', wrap((req, res) => {
    const memId = d.createMemory(db, { ...body(req), tz, source: body(req).source || 'manual' });
    res.status(201).json({ id: memId });
  }));
  app.patch('/api/memories/:id', wrap((req, res) => { d.updateMemory(db, id(req), body(req)); res.json({ ok: true }); }));
  app.delete('/api/memories/:id', wrap((req, res) => { d.deleteMemory(db, id(req)); res.json({ ok: true }); }));

  app.get('/api/plan', wrap((req, res) => {
    const month = req.query.month || today().slice(0, 7);
    res.json(d.getPlan(db, month));
  }));
  app.post('/api/plan/generate', wrap((req, res) => {
    const month = body(req).month || today().slice(0, 7);
    res.json(d.generatePlan(db, month, { overwrite: !!body(req).overwrite, tz }));
  }));
  app.patch('/api/plan/entries/:id', wrap((req, res) => res.json(d.updatePlanEntry(db, id(req), body(req)))));

  app.get('/api/pantry', (req, res) => res.json(d.listPantry(db)));
  app.post('/api/pantry', wrap((req, res) => {
    const { name, quantity, unit, status } = body(req);
    res.status(201).json({ id: d.upsertPantry(db, { name, quantity, unit, status }) });
  }));
  app.patch('/api/pantry/:id', wrap((req, res) => { d.updatePantry(db, id(req), body(req)); res.json({ ok: true }); }));
  app.delete('/api/pantry/:id', wrap((req, res) => { d.deletePantry(db, id(req)); res.json({ ok: true }); }));
  app.post('/api/pantry/import', wrap((req, res) => {
    res.json({ imported: d.importPantryText(db, body(req).text, body(req).status) });
  }));

  app.post('/api/cook/proposal', wrap((req, res) => {
    res.json(d.cookProposal(db, Number(body(req).recipe_id), body(req).servings));
  }));
  app.post('/api/cook/confirm', wrap((req, res) => res.status(201).json(d.cookConfirm(db, body(req)))));
  app.post('/api/cook/:id/undo', wrap((req, res) => { d.undoCook(db, id(req)); res.json({ ok: true }); }));
  app.get('/api/cook/logs', (req, res) => res.json(d.listCookLogs(db)));

  app.get('/api/missing', wrap((req, res) => {
    const days = Math.min(31, Math.max(1, Number(req.query.days) || 7));
    const start = req.query.start || today();
    res.json({ start, days, items: d.missingItems(db, start, days) });
  }));

  app.get('/api/shopping', (req, res) => res.json(d.getShopping(db)));
  app.post('/api/shopping/lists', wrap((req, res) => res.status(201).json({ id: d.createShoppingList(db, body(req).name) })));
  app.post('/api/shopping/lists/:id/items', wrap((req, res) => {
    d.addShoppingItem(db, id(req), { ...body(req), source: 'manual' });
    res.status(201).json({ ok: true });
  }));
  app.post('/api/shopping/lists/:id/from-plan', wrap((req, res) => {
    const days = Math.min(31, Math.max(1, Number(body(req).days) || 7));
    res.json({ added: d.addMissingToList(db, id(req), today(), days) });
  }));
  app.post('/api/shopping/lists/:id/to-pantry', wrap((req, res) => {
    res.json({ moved: d.moveCheckedToPantry(db, id(req)) });
  }));
  app.post('/api/shopping/lists/:id/import', wrap((req, res) => {
    const lines = d.parseIngredientLines(body(req).text);
    if (!lines.length) return res.status(400).json({ error: 'No items found. Put one item per line.' });
    for (const l of lines) d.addShoppingItem(db, id(req), { name: l.name, quantity: l.quantity, unit: l.unit, source: 'upload' });
    res.status(201).json({ added: lines.length });
  }));
  app.patch('/api/shopping/items/:id', wrap((req, res) => { d.updateShoppingItem(db, id(req), body(req)); res.json({ ok: true }); }));
  app.delete('/api/shopping/items/:id', wrap((req, res) => { d.deleteShoppingItem(db, id(req)); res.json({ ok: true }); }));

  app.get('/api/briefing', wrap((req, res) => res.json(d.briefing(db, tz))));

  app.get('/api/notifications', (req, res) => res.json(d.listNotifications(db)));
  app.post('/api/notifications/read', (req, res) => { d.markNotificationsRead(db); res.json({ ok: true }); });

  app.get('/api/feature-requests', (req, res) => res.json(d.listFeatureRequests(db)));
  app.post('/api/feature-requests', wrap((req, res) => {
    res.status(201).json({ id: d.createFeatureRequest(db, req.person.id, body(req).text) });
  }));
  app.patch('/api/feature-requests/:id', wrap((req, res) => { d.updateFeatureRequest(db, id(req), body(req).status); res.json({ ok: true }); }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Static front end. Unknown non-API paths get the app shell.
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // Error handler: known errors keep their status; anything else is logged, not leaked.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof d.HttpError) {
      const payload = { error: err.message };
      if (err.missing) payload.missing = err.missing;
      return res.status(err.status).json(payload);
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error('[orby] unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  });

  return app;
}

module.exports = { createApp, COOKIE };
