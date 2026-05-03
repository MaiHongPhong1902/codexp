'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const c = require('./colors');
const P = require('./paths');
const A = require('./auth');

// ---------- usage cache ------------------------------------------------------

const USAGE_CACHE_FILE = () => path.join(P.profilesDir(), '.usage-cache.json');

function readUsageCache() {
  try { return JSON.parse(fs.readFileSync(USAGE_CACHE_FILE(), 'utf8')); } catch { return {}; }
}

function writeUsageCache(cache) {
  P.ensureProfilesDir();
  fs.writeFileSync(USAGE_CACHE_FILE(), JSON.stringify(cache, null, 2));
}

function saveUsageForProfile(profileName, usage) {
  const cache = readUsageCache();
  cache[profileName] = { ts: Date.now(), data: usage };
  writeUsageCache(cache);
}

function getCachedUsage(profileName) {
  const cache = readUsageCache();
  return cache[profileName] || null;
}

async function refreshUsageForProfile(profileName, authPath, opts = {}) {
  let info;
  try { info = A.readAuth(authPath); } catch { return false; }
  const accessToken = (info && info.raw && info.raw.tokens) ? info.raw.tokens.access_token : null;
  if (!accessToken) return false;
  try {
    if (opts.logStart) console.log(c.dim(opts.logStart));
    const usage = await fetchUsage(accessToken);
    saveUsageForProfile(profileName, usage);
    return true;
  } catch (e) {
    if (opts.logErrors) {
      console.log(c.dim(`  (could not fetch usage for ${profileName}: ${e.message || e})`));
    }
  }
  return false;
}

// ---------- helpers ----------------------------------------------------------

function listProfiles() {
  P.ensureProfilesDir();
  return fs.readdirSync(P.profilesDir())
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
    .map(f => f.replace(/\.json$/, ''))
    .sort();
}

function getActive() {
  try { return fs.readFileSync(P.activeFile(), 'utf8').trim() || null; } catch { return null; }
}
function setActive(name) {
  fs.writeFileSync(P.activeFile(), name, 'utf8');
}

function isCodexRunning() {
  // Best-effort: tasklist on Windows, ps on others.
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq codex.exe', '/NH'], { encoding: 'utf8' });
      return /codex\.exe/i.test(r.stdout || '');
    } else {
      const r = spawnSync('pgrep', ['-x', 'codex'], { encoding: 'utf8' });
      return r.status === 0;
    }
  } catch { return false; }
}

function fmtExpiry(label, dt) {
  if (!dt) return c.gray(`${label}: -`);
  const ms = dt.getTime() - Date.now();
  const txt = A.humanizeDelta(ms);
  const colorize = ms < 0 ? c.red : (ms < 24*3600*1000 ? c.yellow : c.green);
  return `${c.dim(label + ':')} ${colorize(txt)} ${c.dim('(' + dt.toISOString().replace('T',' ').slice(0,16) + 'Z)')}`;
}

function ensureCodexBinary() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(cmd, ['codex'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) {
    throw new Error(`'codex' CLI not found on PATH. Install it first (npm i -g @openai/codex) or run 'codex --version' to verify.`);
  }
  return r.stdout.split(/\r?\n/)[0].trim();
}

// ---------- commands ---------------------------------------------------------

async function cmdList(opts) {
  P.ensureProfilesDir();
  const codexHome = P.resolveCodexHome(opts.home);
  const liveAuth = P.authFile(codexHome);
  const active = getActive();
  const names = listProfiles();

  console.log('');

  if (names.length === 0) {
    console.log(c.gray("  (no profiles yet - run 'codex-profile login <name>' or 'save <name>')"));
    console.log('');
    return;
  }

  for (const name of names) {
    const file = P.profileFile(name);
    let info;
    try { info = A.readAuth(file); } catch (e) { console.log(`  ${c.red('!')} ${name}  ${c.red('(invalid: ' + e.message + ')')}`); continue; }

    const isActiveName = name === active;
    const isLive       = fs.existsSync(liveAuth) && A.sameLogin(liveAuth, file);
    const marker       = isLive ? c.green('●') : (isActiveName ? c.yellow('○') : ' ');

    const accExpMs = info.accessExp ? info.accessExp.getTime() - Date.now() : null;
    const refExpMs = info.refreshExp ? info.refreshExp.getTime() - Date.now() : null;
    const usable = (accExpMs != null && accExpMs > 0) || (refExpMs != null && refExpMs > 0);
    const status = usable ? c.green('USABLE') : c.red('EXPIRED');

    console.log('');
    console.log(`  ${marker} ${c.bold(name)}  ${status}${isLive ? c.green('  [LIVE]') : ''}`);
    if (info.email)     console.log(`      ${c.dim('account :')} ${info.email}${info.plan ? c.dim(' ('+info.plan+')') : ''}`);
    if (info.accountId) console.log(`      ${c.dim('id      :')} ${info.accountId}`);
    console.log(`      ${fmtExpiry('access  ', info.accessExp)}`);
    console.log(`      ${fmtExpiry('refresh ', info.refreshExp)}`);
    if (info.lastRefresh) console.log(`      ${c.dim('last refresh:')} ${info.lastRefresh.toISOString().replace('T',' ').slice(0,16)}Z`);

    // Show cached usage (no API call). If reset_at has passed, show 100%.
    const cached = getCachedUsage(name);
    if (cached && cached.data) {
      const rl = cached.data.rate_limit || {};
      const now = Date.now();
      const pw = smartWindow(rl.primary_window, now);
      const sw = smartWindow(rl.secondary_window, now);
      if (pw) console.log(`      ${c.dim('5h limit:')} ${renderBar(pw.used, 20)}${fmtReset(pw.resetAt)}${pw.didReset ? c.green(' [reset]') : ''}`);
      if (sw) console.log(`      ${c.dim('weekly  :')} ${renderBar(sw.used, 20)}${fmtReset(sw.resetAt)}${sw.didReset ? c.green(' [reset]') : ''}`);
      console.log(`      ${c.dim('updated : ' + new Date(cached.ts).toISOString().replace('T',' ').slice(0,16) + 'Z')}`);
    } else {
      console.log(`      ${c.dim('usage   : (switch to this profile to fetch)')}`);
    }
  }
  console.log('');
  console.log(c.dim('Legend: ') + c.green('● LIVE (matches active auth.json)   ') + c.yellow('○ marked active   ') + '  blank = saved');
  console.log('');
}

async function cmdSave(name, opts) {
  P.ensureProfilesDir();
  const codexHome = P.resolveCodexHome(opts.home);
  const src = P.authFile(codexHome);
  if (!fs.existsSync(src)) throw new Error(`auth.json not found at ${src}. Login first.`);

  // Auto-derive name from account email if not provided
  if (!name) {
    const info = A.readAuth(src);
    name = info.email ? info.email.replace(/[^A-Za-z0-9._-]/g, '_') : null;
    if (!name) throw new Error('Cannot detect account from auth.json. Provide a name: save <name>');
  }

  const dst = P.profileFile(name);
  fs.copyFileSync(src, dst);
  setActive(name);
  let info; try { info = A.readAuth(dst); } catch {}
  console.log(c.green(`Saved -> profiles/${name}.json`) + (info && info.email ? c.dim(` (${info.email})`) : ''));
}

async function cmdUse(name, opts) {
  if (!name) throw new Error('Usage: codex-profile use <name>');
  const src = P.profileFile(name);
  if (!fs.existsSync(src)) throw new Error(`Profile '${name}' not found.`);

  const codexHome = P.resolveCodexHome(opts.home);
  if (!fs.existsSync(codexHome)) fs.mkdirSync(codexHome, { recursive: true });
  const dst = P.authFile(codexHome);

  if (isCodexRunning() && !opts.force) {
    console.log(c.yellow('WARNING: A `codex` process is currently running. It will keep using the OLD token in memory.'));
    console.log(c.yellow('         Exit Codex first, or pass --force to switch anyway.'));
    process.exitCode = 2;
    return;
  }

  // Auto-save current auth.json back into the active profile before switching.
  // This ensures the latest tokens (possibly refreshed by Codex) are preserved.
  if (fs.existsSync(dst)) {
    const currentActive = getActive();
    if (currentActive && currentActive !== name) {
      const currentProfile = P.profileFile(currentActive);
      if (fs.existsSync(currentProfile)) {
        // Only update if live auth.json is newer (different) than saved profile
        if (!A.sameLogin(dst, currentProfile) || A.fileFingerprint(dst) !== A.fileFingerprint(currentProfile)) {
          fs.copyFileSync(dst, currentProfile);
          let curInfo; try { curInfo = A.readAuth(currentProfile); } catch {}
          console.log(c.dim(`Auto-saved current auth.json -> profiles/${currentActive}.json`) +
            (curInfo && curInfo.email ? c.dim(` (${curInfo.email})`) : ''));

          await refreshUsageForProfile(currentActive, currentProfile, {
            logStart: `  Updating usage for '${currentActive}'...`,
            logErrors: true,
          });
        }
      }
    }
    // Also keep a backup
    fs.copyFileSync(dst, path.join(P.profilesDir(), '.backup.json'));
  }

  fs.copyFileSync(src, dst);
  setActive(name);

  // Show expiry of newly active profile
  let info; try { info = A.readAuth(dst); } catch { info = null; }
  console.log(c.green(`Switched -> profile '${name}'`));
  if (info) {
    if (info.email) console.log(c.dim(`  account : `) + info.email);
    console.log('  ' + fmtExpiry('access  ', info.accessExp));
    console.log('  ' + fmtExpiry('refresh ', info.refreshExp));
  }

  // Fetch & cache usage for the new profile
  const accessToken = (info && info.raw && info.raw.tokens) ? info.raw.tokens.access_token : null;
  if (accessToken) {
    try {
      console.log(c.dim('  Fetching usage...'));
      const usage = await fetchUsage(accessToken);
      saveUsageForProfile(name, usage);
      const rl = usage.rate_limit || {};
      if (rl.primary_window) console.log(`  ${c.dim('5h limit:')} ${renderBar(rl.primary_window.used_percent, 20)}${fmtReset(rl.primary_window.reset_at)}`);
      if (rl.secondary_window) console.log(`  ${c.dim('weekly  :')} ${renderBar(rl.secondary_window.used_percent, 20)}${fmtReset(rl.secondary_window.reset_at)}`);
    } catch (e) {
      console.log(c.dim('  (could not fetch usage: ' + (e.message || e) + ')'));
    }
  }

  console.log(c.cyan('\nNow start Codex:  ') + c.bold('codex'));

  await cmdList(opts);
}

async function cmdRemove(name) {
  if (!name) throw new Error('Usage: codex-profile remove <name>');
  const f = P.profileFile(name);
  if (!fs.existsSync(f)) throw new Error(`Profile '${name}' not found.`);
  fs.unlinkSync(f);
  if (getActive() === name) { try { fs.unlinkSync(P.activeFile()); } catch {} }
  console.log(c.green(`Removed profile '${name}'.`));
}

async function cmdRename(oldName, newName) {
  if (!oldName || !newName) throw new Error('Usage: codex-profile rename <old> <new>');
  if (!/^[A-Za-z0-9._-]+$/.test(newName)) throw new Error('Invalid new name.');
  const src = P.profileFile(oldName), dst = P.profileFile(newName);
  if (!fs.existsSync(src)) throw new Error(`Profile '${oldName}' not found.`);
  if (fs.existsSync(dst))  throw new Error(`Profile '${newName}' already exists.`);
  fs.renameSync(src, dst);
  if (getActive() === oldName) setActive(newName);
  console.log(c.green(`Renamed '${oldName}' -> '${newName}'.`));
}

async function cmdCurrent(opts) {
  const codexHome = P.resolveCodexHome(opts.home);
  const liveAuth = P.authFile(codexHome);
  const names = listProfiles();
  let live = null;
  if (fs.existsSync(liveAuth)) {
    for (const n of names) {
      if (A.sameLogin(liveAuth, P.profileFile(n))) { live = n; break; }
    }
  }
  if (live) console.log(live);
  else console.log(c.gray('(active auth.json does not match any saved profile)'));
}

async function cmdWhere(opts) {
  const codexHome = P.resolveCodexHome(opts.home);
  console.log(`user        : ${P.username()}`);
  console.log(`CODEX_HOME  : ${codexHome}`);
  console.log(`auth.json   : ${P.authFile(codexHome)}`);
  console.log(`profiles    : ${P.profilesDir()}`);
}

async function cmdRestore(opts) {
  const codexHome = P.resolveCodexHome(opts.home);
  const dst = P.authFile(codexHome);
  const bak = path.join(P.profilesDir(), '.backup.json');
  if (!fs.existsSync(bak)) throw new Error(`No backup found at ${bak}`);
  fs.copyFileSync(bak, dst);
  console.log(c.green(`Restored ${dst} from .backup.json`));
}

// Run `codex login` against a temporary CODEX_HOME, then snapshot the resulting
// auth.json into profiles/<name>.json. Leaves the user's real ~/.codex untouched.
async function cmdLogin(name, opts) {
  ensureCodexBinary();

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-login-'));
  console.log(c.cyan('Launching codex login...'));
  console.log(c.dim('Complete the browser flow. This will NOT touch your real ~/.codex/auth.json.'));
  console.log('');

  await new Promise((resolve, reject) => {
    const child = spawn('codex', ['login'], {
      stdio: 'inherit',
      env: { ...process.env, CODEX_HOME: tmpHome },
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`codex login exited with code ${code}`)));
    child.on('error', reject);
  });

  const newAuth = path.join(tmpHome, 'auth.json');
  if (!fs.existsSync(newAuth)) throw new Error('Login finished but no auth.json was created.');
  P.ensureProfilesDir();

  // Auto-derive name from account email
  if (!name) {
    try {
      const info = A.readAuth(newAuth);
      name = info.email ? info.email.replace(/[^A-Za-z0-9._-]/g, '_') : null;
    } catch {}
    if (!name) throw new Error('Cannot detect account. Provide a name: login <name>');
  }

  const dst = P.profileFile(name);
  fs.copyFileSync(newAuth, dst);
  setActive(name);

  // best-effort cleanup
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}

  let info; try { info = A.readAuth(dst); } catch {}
  console.log(c.green(`\nLogin captured -> profiles/${name}.json`));
  if (info) {
    if (info.email) console.log(c.dim('  account : ') + info.email);
    console.log('  ' + fmtExpiry('access  ', info.accessExp));
    console.log('  ' + fmtExpiry('refresh ', info.refreshExp));
  }

  // Fetch & cache usage for the new profile
  const accessToken = (info && info.raw && info.raw.tokens) ? info.raw.tokens.access_token : null;
  if (accessToken) {
    try {
      console.log(c.dim('  Fetching usage...'));
      const usage = await fetchUsage(accessToken);
      saveUsageForProfile(name, usage);
      const rl = usage.rate_limit || {};
      if (rl.primary_window) console.log(`  ${c.dim('5h limit:')} ${renderBar(rl.primary_window.used_percent, 20)}${fmtReset(rl.primary_window.reset_at)}`);
      if (rl.secondary_window) console.log(`  ${c.dim('weekly  :')} ${renderBar(rl.secondary_window.used_percent, 20)}${fmtReset(rl.secondary_window.reset_at)}`);
    } catch (e) {
      console.log(c.dim('  (could not fetch usage: ' + (e.message || e) + ')'));
    }
  }

  console.log(c.cyan(`\nActivate it now with:  codexp use ${name}`));
}

// Re-login for an existing profile to get fresh tokens.
async function cmdRefresh(name, opts) {
  if (!name) throw new Error('Usage: codexp refresh <name>');
  const src = P.profileFile(name);
  if (!fs.existsSync(src)) throw new Error(`Profile '${name}' not found. Use 'login <name>' to create a new one.`);

  let info;
  try { info = A.readAuth(src); } catch {}
  if (info && info.email) console.log(c.dim(`Re-logging in for profile '${name}' (${info.email})...`));
  else console.log(c.dim(`Re-logging in for profile '${name}'...`));

  // Force overwrite since we're explicitly refreshing
  opts = { ...opts, force: true };
  await cmdLogin(name, opts);
}

// ---------- status (usage / rate limits) -------------------------------------

const USAGE_URLS = [
  'https://chatgpt.com/backend-api/wham/usage',
  'https://api.openai.com/api/codex/usage',
];

function httpGet(urlStr, accessToken) {
  const https = require('https');
  const url = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

async function fetchUsage(accessToken) {
  for (const url of USAGE_URLS) {
    try {
      const res = await httpGet(url, accessToken);
      if (res.status === 200) return JSON.parse(res.body);
    } catch {}
  }
  throw new Error('Failed to fetch usage from all endpoints. Token may be expired.');
}

// If current time > reset_at, the window has reset → show 0% used.
// Also compute the next reset_at by adding window seconds.
function smartWindow(window, nowMs) {
  if (!window) return null;
  const resetMs = (window.reset_at || 0) * 1000;
  if (nowMs >= resetMs) {
    // Window has reset since last fetch
    const windowSec = window.limit_window_seconds || 18000; // default 5h
    const newResetAt = window.reset_at + windowSec;
    return { used: 0, resetAt: newResetAt, didReset: true };
  }
  return { used: window.used_percent || 0, resetAt: window.reset_at, didReset: false };
}

function renderBar(usedPct, width) {
  const remaining = Math.max(0, Math.min(100, 100 - (usedPct || 0)));
  const filled = Math.round((remaining / 100) * width);
  const empty = width - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  const colorize = remaining > 50 ? c.green : (remaining > 20 ? c.yellow : c.red);
  return colorize(bar) + ` ${remaining.toFixed(0)}% left`;
}

function fmtReset(resetAt) {
  if (!resetAt) return '';
  // reset_at is Unix timestamp in seconds
  const d = new Date(resetAt * 1000);
  const ms = d.getTime() - Date.now();
  return c.dim(` (resets ${A.humanizeDelta(ms)} - ${d.toISOString().replace('T', ' ').slice(0, 16)}Z)`);
}

async function cmdStatus(name, opts) {
  // Determine which auth to use: specific profile, or live auth.json
  let authPath;
  if (name) {
    authPath = P.profileFile(name);
    if (!fs.existsSync(authPath)) throw new Error(`Profile '${name}' not found.`);
  } else {
    const codexHome = P.resolveCodexHome(opts.home);
    authPath = P.authFile(codexHome);
    if (!fs.existsSync(authPath)) throw new Error(`auth.json not found. Provide a profile name: status <name>`);
  }

  const auth = A.readAuth(authPath);
  const accessToken = (auth.raw.tokens || {}).access_token;
  if (!accessToken) throw new Error('No access_token found in auth.json.');

  const label = name || getActive() || 'live';
  console.log(c.dim(`Fetching usage for ${label}${auth.email ? ' (' + auth.email + ')' : ''}...`));

  const usage = await fetchUsage(accessToken);
  saveUsageForProfile(label, usage);

  console.log('');
  console.log(c.cyan(c.bold(`  ${auth.email || label}`) + (usage.plan_type ? c.dim(` (${usage.plan_type})`) : '')));
  console.log('');

  const rl = usage.rate_limit || {};

  if (rl.primary_window) {
    const pw = rl.primary_window;
    console.log(`  5h limit  : ${renderBar(pw.used_percent, 25)}${fmtReset(pw.reset_at)}`);
  }
  if (rl.secondary_window) {
    const sw = rl.secondary_window;
    console.log(`  Weekly    : ${renderBar(sw.used_percent, 25)}${fmtReset(sw.reset_at)}`);
  }

  const cr = usage.code_review_rate_limit || {};
  if (cr.primary_window || cr.secondary_window) {
    console.log('');
    if (cr.primary_window) {
      console.log(`  CR 5h     : ${renderBar(cr.primary_window.used_percent, 25)}${fmtReset(cr.primary_window.reset_at)}`);
    }
    if (cr.secondary_window) {
      console.log(`  CR Weekly : ${renderBar(cr.secondary_window.used_percent, 25)}${fmtReset(cr.secondary_window.reset_at)}`);
    }
  }

  const credits = usage.credits || {};
  if (credits.has_credits) {
    console.log('');
    console.log(`  Credits   : ${credits.unlimited ? c.green('unlimited') : (credits.balance != null ? c.bold('$' + credits.balance.toFixed(2)) : '-')}`);
  }
  console.log('');
}

// ---------- dispatcher ------------------------------------------------------

const COMMANDS = ['list', 'login', 'refresh', 'use', 'remove', 'status', 'help', 'shell', 'menu', 'exit', 'quit', 'clear', 'cls'];

async function dispatch(positional, opts, helpFn) {
  const sub = positional[0] || 'list';
  switch (sub) {
    case 'help': case '-h': case '--help': if (helpFn) helpFn(); break;
    case 'list':    await cmdList(opts); break;
    case 'save':    await cmdSave(positional[1], opts); break;
    case 'use':     await cmdUse(positional[1], opts); break;
    case 'remove': case 'rm': case 'delete':
                    await cmdRemove(positional[1]); break;
    case 'current': await cmdCurrent(opts); break;
    case 'status': case 'usage':
                    await cmdStatus(positional[1], opts); break;
    case 'login':   await cmdLogin(positional[1], opts); break;
    case 'refresh': case 'update':
                    await cmdRefresh(positional[1], opts); break;
    case 'shell': case 'menu': case 'i': case 'repl':
                    await cmdShell(opts, helpFn); break;
    default:
      throw new Error(`Unknown command: ${sub}`);
  }
}

// ---------- interactive shell -----------------------------------------------

async function cmdShell(opts, helpFn) {
  const readline = require('readline');

  const completer = (line) => {
    const parts = line.split(/\s+/);
    if (parts.length <= 1) {
      const hits = COMMANDS.filter(x => x.startsWith(parts[0]));
      return [hits.length ? hits : COMMANDS, parts[0]];
    }
    // complete profile names for use/remove/rename/save
    if (['use', 'remove', 'rm', 'delete', 'refresh', 'status', 'usage'].includes(parts[0])) {
      const names = listProfiles();
      const last = parts[parts.length - 1];
      const hits = names.filter(n => n.startsWith(last));
      return [hits.length ? hits : names, last];
    }
    return [[], line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    historySize: 100,
    terminal: true,
  });

  console.log('');
  console.log(c.cyan(c.bold('  codexp interactive shell')));

  // Auto-show profiles on startup
  try { await cmdList(opts); } catch (e) { console.error(c.red('Error: ') + e.message); }

  console.log(c.dim(`  login`) + c.dim(' | ') + c.dim('refresh <name>') + c.dim(' | ') + c.dim('use <name>') + c.dim(' | ') + c.dim('remove <name>') + c.dim(' | ') + c.dim('exit'));
  console.log(c.dim('  TAB = autocomplete'));

  const prompt = c.cyan('codexp') + c.dim(' > ');
  rl.setPrompt(prompt);
  rl.prompt();

  let done = false;
  await new Promise((resolve) => {
    rl.on('line', async (line) => {
      if (done) return;
      const trimmed = line.trim();
      if (!trimmed) { if (!done) rl.prompt(); return; }
      const args = parseShellLine(trimmed);
      const head = args[0].toLowerCase();

      if (head === 'exit' || head === 'quit' || head === 'q') { done = true; rl.close(); return; }
      if (head === 'clear' || head === 'cls') { console.clear(); if (!done) rl.prompt(); return; }

      try {
        await dispatch(args, opts, helpFn);
      } catch (e) {
        console.error(c.red('Error: ') + (e && e.message ? e.message : String(e)));
      }
      if (!done) rl.prompt();
    });
    rl.on('close', () => { done = true; console.log(c.dim('\nbye.')); resolve(); });
    rl.on('SIGINT', () => { done = true; rl.close(); });
  });
}

// minimal shell-line parser supporting double-quoted args (for paths with spaces)
function parseShellLine(line) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

module.exports = {
  cmdList, cmdSave, cmdUse, cmdRemove, cmdCurrent, cmdStatus, cmdLogin, cmdRefresh, cmdShell,
  dispatch, COMMANDS,
};
