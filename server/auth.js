'use strict';
// PIN-based sign-in for the two household members. Sessions are random tokens
// stored only as SHA-256 hashes. PINs are scrypt-hashed. Failed attempts lock a
// person out for 15 minutes after 5 misses.
const crypto = require('node:crypto');

const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPin(pin, stored) {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function validPin(pin) {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

function createSession(db, personId, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, person_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), personId, now + SESSION_DAYS * 86400000);
  return token;
}

function sessionPerson(db, token, now = Date.now()) {
  if (!token) return null;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  const row = db.prepare(
    'SELECT p.id, p.name FROM sessions s JOIN people p ON p.id = s.person_id WHERE s.token_hash = ? AND s.expires_at >= ?'
  ).get(sha256(token), now);
  return row || null;
}

function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

// Returns { ok: true } or { ok: false, status, error }.
function attemptLogin(db, personId, pin, now = Date.now()) {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person || !person.pin_hash) return { ok: false, status: 401, error: 'Sign-in failed.' };
  if (person.pin_locked_until > now) {
    return { ok: false, status: 429, error: 'Too many attempts. Try again in a few minutes.' };
  }
  if (verifyPin(pin, person.pin_hash)) {
    db.prepare('UPDATE people SET pin_failures = 0, pin_locked_until = 0 WHERE id = ?').run(personId);
    return { ok: true };
  }
  const failures = person.pin_failures + 1;
  const lockedUntil = failures >= MAX_FAILURES ? now + LOCK_MS : 0;
  db.prepare('UPDATE people SET pin_failures = ?, pin_locked_until = ? WHERE id = ?')
    .run(lockedUntil ? 0 : failures, lockedUntil, personId);
  return { ok: false, status: 401, error: 'Sign-in failed.' };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = {
  SESSION_DAYS,
  hashPin,
  verifyPin,
  validPin,
  createSession,
  sessionPerson,
  deleteSession,
  attemptLogin,
  parseCookies,
};
