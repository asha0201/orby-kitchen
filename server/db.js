'use strict';
// SQLite storage with ordered, forward-only migrations.
// Rollback: restore the backup taken before the migration (see README). Each
// migration is additive, so an older app build can read a newer file only if
// no column it needs was dropped; we never drop columns in place.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pin_hash TEXT,
        pin_failures INTEGER NOT NULL DEFAULT 0,
        pin_locked_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      -- Household-wide answers and settings (key/value, JSON values).
      CREATE TABLE household (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      -- One row per person: structured profile + onboarding answers (JSON).
      CREATE TABLE profiles (
        person_id TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
        data TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cuisine TEXT,
        meal_types TEXT NOT NULL DEFAULT '[]',
        active_minutes INTEGER,
        total_minutes INTEGER,
        servings INTEGER NOT NULL DEFAULT 2,
        ingredients TEXT NOT NULL DEFAULT '[]',
        steps TEXT NOT NULL DEFAULT '[]',
        air_fryer TEXT,
        storage_notes TEXT,
        nutrition TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE recipe_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
        cooked_on TEXT NOT NULL,
        rating INTEGER,
        notes TEXT,
        modifications TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE plan_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_date TEXT NOT NULL,
        slot TEXT NOT NULL,
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
        reason TEXT,
        locked INTEGER NOT NULL DEFAULT 0,
        UNIQUE (plan_date, slot)
      );
      CREATE TABLE pantry_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        normalized TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','estimated')),
        updated_at INTEGER NOT NULL,
        UNIQUE (normalized, unit)
      );
      -- Each cooked meal, with the deductions applied (kept so it can be undone).
      CREATE TABLE cook_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
        recipe_name TEXT NOT NULL,
        cooked_on TEXT NOT NULL,
        deductions TEXT NOT NULL DEFAULT '[]',
        undone INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE shopping_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE shopping_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        normalized TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT '',
        checked INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL CHECK (scope IN ('household','person')),
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('one_time','lasting')),
        effect TEXT NOT NULL DEFAULT 'note' CHECK (effect IN ('note','avoid_recipe','avoid_ingredient')),
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
        keyword TEXT,
        text TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        expires_on TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        dedupe_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        read_at INTEGER
      );
      CREATE TABLE feature_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requested_by TEXT REFERENCES people(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','in_progress','done','rejected')),
        draft_spec TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `,
  },
];

function openDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

module.exports = { openDatabase, migrate, MIGRATIONS };
