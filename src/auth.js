'use strict';

const fs = require('fs');
const crypto = require('crypto');

function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? b64 + '='.repeat(4 - (b64.length % 4)) : b64;
    return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function pickEmail(...payloads) {
  for (const p of payloads) {
    if (!p) continue;
    if (typeof p.email === 'string') return p.email;
    const auth = p['https://api.openai.com/auth'];
    if (auth && typeof auth.user_email === 'string') return auth.user_email;
    if (typeof p.preferred_username === 'string') return p.preferred_username;
  }
  return null;
}

function readAuth(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const tokens = raw.tokens || {};
  const access  = decodeJwt(tokens.access_token);
  const id      = decodeJwt(tokens.id_token);
  const refresh = decodeJwt(tokens.refresh_token);

  return {
    raw,
    email: pickEmail(id, access),
    accountId: tokens.account_id || raw.account_id || null,
    plan: (id && (id['https://api.openai.com/auth'] || {}).chatgpt_plan_type) || null,
    accessExp:  access?.exp ? new Date(access.exp * 1000) : null,
    idExp:      id?.exp     ? new Date(id.exp * 1000)     : null,
    refreshExp: refresh?.exp ? new Date(refresh.exp * 1000) : null,
    lastRefresh: raw.last_refresh ? new Date(raw.last_refresh) : null,
  };
}

function fileFingerprint(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch { return null; }
}

// Compare two auth files semantically: same refresh_token == same login.
function sameLogin(aPath, bPath) {
  try {
    const a = JSON.parse(fs.readFileSync(aPath, 'utf8'));
    const b = JSON.parse(fs.readFileSync(bPath, 'utf8'));
    const ra = (a.tokens || {}).refresh_token;
    const rb = (b.tokens || {}).refresh_token;
    if (ra && rb) return ra === rb;
    return fileFingerprint(aPath) === fileFingerprint(bPath);
  } catch { return false; }
}

function humanizeDelta(ms) {
  if (ms == null || Number.isNaN(ms)) return 'unknown';
  const past = ms < 0;
  ms = Math.abs(ms);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  let out;
  if (d > 0) out = `${d}d ${h}h`;
  else if (h > 0) out = `${h}h ${m}m`;
  else if (m > 0) out = `${m}m`;
  else out = `${s}s`;
  return past ? `expired ${out} ago` : `in ${out}`;
}

module.exports = { decodeJwt, readAuth, sameLogin, fileFingerprint, humanizeDelta };
