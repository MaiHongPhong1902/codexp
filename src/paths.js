'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// Profiles contain OAuth tokens, so the default storage is per-user data instead
// of a source/package directory. Override with CP_PROFILES_DIR when needed.
function profilesDir() {
  if (process.env.CP_PROFILES_DIR) return path.resolve(process.env.CP_PROFILES_DIR);
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'codexp', 'profiles');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'codexp', 'profiles');
  }
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'codexp', 'profiles');
  }
  return path.join(os.homedir(), '.codexp', 'profiles');
}

// The Codex home (folder that holds auth.json). Resolution order:
// 1. --home <path>  (handled by caller, passed in)
// 2. $env:CODEX_HOME
// 3. <userHome>/.codex            (the canonical default)
function resolveCodexHome(override) {
  if (override) return path.resolve(override);
  if (process.env.CODEX_HOME) return path.resolve(process.env.CODEX_HOME);
  return path.join(os.homedir(), '.codex');
}

function authFile(codexHome) {
  return path.join(codexHome, 'auth.json');
}

function validateProfileName(name) {
  if (typeof name !== 'string' || !name) {
    throw new Error('Profile name is required.');
  }
  if (!PROFILE_NAME_RE.test(name)) {
    throw new Error('Invalid profile name. Use 1-128 characters: letters, numbers, dot, dash, or underscore; start with a letter or number.');
  }
  return name;
}

function isValidProfileName(name) {
  try {
    validateProfileName(name);
    return true;
  } catch {
    return false;
  }
}

function sanitizeProfileName(value) {
  const cleaned = String(value || '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 128);
  return isValidProfileName(cleaned) ? cleaned : null;
}

function profileFile(name) {
  const safeName = validateProfileName(name);
  const base = path.resolve(profilesDir());
  const file = path.resolve(base, `${safeName}.json`);
  if (!file.startsWith(base + path.sep)) {
    throw new Error('Profile path escaped the profiles directory.');
  }
  return file;
}

function activeFile() {
  return path.join(profilesDir(), '.active');
}

function ensureProfilesDir() {
  const d = profilesDir();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function username() {
  try { return os.userInfo().username; } catch { return process.env.USERNAME || process.env.USER || 'unknown'; }
}

module.exports = {
  profilesDir,
  resolveCodexHome,
  authFile,
  profileFile,
  validateProfileName,
  isValidProfileName,
  sanitizeProfileName,
  activeFile,
  ensureProfilesDir,
  username,
};
