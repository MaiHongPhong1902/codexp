'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

// Profiles are stored next to the CLI installation, in a sibling `profiles/` folder.
// (i.e. <repo>/codex-profile-cli/../profiles)  -- but user can override with $CP_PROFILES_DIR.
function profilesDir() {
  if (process.env.CP_PROFILES_DIR) return path.resolve(process.env.CP_PROFILES_DIR);
  return path.resolve(__dirname, '..', 'profiles');
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

function profileFile(name) {
  return path.join(profilesDir(), `${name}.json`);
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
  activeFile,
  ensureProfilesDir,
  username,
};
