'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('./db');
const { createApp } = require('./app');
const d = require('./domain');

// Load .env when present (no extra dependency). Real environment variables win.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile) && process.loadEnvFile) {
  try { process.loadEnvFile(envFile); } catch (err) { console.warn('[orby] could not read .env:', err.message); }
}

const config = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'orby.db'),
  tz: process.env.TZ_NAME || 'UTC',
  secureCookies: process.env.SECURE_COOKIES === '1',
};

// Validate the time zone early so a typo fails at startup, not at 08:00.
try { new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }); } catch {
  console.error(`[orby] TZ_NAME "${config.tz}" is not a valid IANA time zone.`);
  process.exit(1);
}

const db = openDatabase(config.dbPath);

// The two household members are fixed. Their rows are created once, without PINs until setup.
db.exec(`INSERT OR IGNORE INTO people (id, name) VALUES ('asha', 'Asha'), ('prabha', 'Prabha');
  INSERT OR IGNORE INTO profiles (person_id, data, updated_at) VALUES ('asha', '{}', 0), ('prabha', '{}', 0);`);

const app = createApp({ db, config });
const server = app.listen(config.port, () => {
  console.log(`[orby] listening on http://localhost:${config.port} (db: ${config.dbPath}, tz: ${config.tz})`);
});

// Scheduler: checks every minute. Notifications are deduplicated by key, so restarts never duplicate them.
const tick = () => {
  try {
    // Nothing is scheduled until both members have set PINs (setup complete).
    if (db.prepare('SELECT COUNT(*) AS n FROM people WHERE pin_hash IS NOT NULL').get().n === 2) {
      d.runScheduledNotifications(db, config.tz);
    }
  } catch (err) {
    console.error('[orby] scheduler error:', err);
  }
};
tick();
const timer = setInterval(tick, 60 * 1000);
timer.unref();

function shutdown() {
  clearInterval(timer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, db };
