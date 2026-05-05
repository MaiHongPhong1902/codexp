'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const cmds = require('../src/commands');
const P = require('../src/paths');

function authWithRefresh(refreshToken) {
  return JSON.stringify({ tokens: { refresh_token: refreshToken } }, null, 2);
}

function readAuth(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function withSandbox(fn) {
  const previousProfiles = process.env.CP_PROFILES_DIR;
  const root = fs.mkdtempSync(path.join(process.cwd(), '.test-tmp-commands-'));
  const profiles = path.join(root, 'profiles');
  const home = path.join(root, 'home');
  process.env.CP_PROFILES_DIR = profiles;
  fs.mkdirSync(profiles, { recursive: true });
  fs.mkdirSync(home, { recursive: true });

  try {
    return await fn({ root, profiles, home });
  } finally {
    if (previousProfiles == null) delete process.env.CP_PROFILES_DIR;
    else process.env.CP_PROFILES_DIR = previousProfiles;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function captureOutput(fn) {
  const lines = [];
  const oldLog = console.log;
  const oldError = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    await fn();
    return lines.join('\n');
  } finally {
    console.log = oldLog;
    console.error = oldError;
  }
}

test('dispatcher exposes commands advertised by help', () => {
  for (const command of ['save', 'current', 'rename', 'restore', 'where']) {
    assert.ok(cmds.COMMANDS.includes(command), `${command} missing from COMMANDS`);
  }
});

test('rename, restore, and where dispatch without Unknown command', async () => {
  await withSandbox(async ({ home }) => {
    fs.writeFileSync(P.profileFile('old'), authWithRefresh('old-token'));
    fs.writeFileSync(path.join(P.profilesDir(), '.backup.json'), authWithRefresh('backup-token'));

    await captureOutput(() => cmds.dispatch(['rename', 'old', 'new'], {}, () => {}));
    assert.equal(fs.existsSync(P.profileFile('old')), false);
    assert.equal(readAuth(P.profileFile('new')).tokens.refresh_token, 'old-token');

    await captureOutput(() => cmds.dispatch(['restore'], { home }, () => {}));
    assert.equal(readAuth(P.authFile(home)).tokens.refresh_token, 'backup-token');

    const output = await captureOutput(() => cmds.dispatch(['where'], { home }, () => {}));
    assert.match(output, /CODEX_HOME/);
    assert.match(output, /profiles/);
  });
});

test('use does not overwrite stale active profile with a different live login', async () => {
  await withSandbox(async ({ home }) => {
    fs.writeFileSync(P.profileFile('target'), authWithRefresh('target-token'));
    fs.writeFileSync(P.profileFile('stale'), authWithRefresh('stale-token'));
    fs.writeFileSync(P.activeFile(), 'stale', 'utf8');
    fs.writeFileSync(P.authFile(home), authWithRefresh('live-token'));

    const output = await captureOutput(() => cmds.cmdUse('target', { home, force: true }));

    assert.match(output, /Skipped saving 'stale'/);
    assert.equal(readAuth(P.profileFile('stale')).tokens.refresh_token, 'stale-token');
    assert.equal(readAuth(P.authFile(home)).tokens.refresh_token, 'target-token');
    assert.equal(fs.readFileSync(P.activeFile(), 'utf8'), 'target');
  });
});

test('save snapshots live auth and marks it active', async () => {
  await withSandbox(async ({ home }) => {
    fs.writeFileSync(P.authFile(home), authWithRefresh('work-token'));

    await captureOutput(() => cmds.cmdSave('work', { home }));

    assert.equal(readAuth(P.profileFile('work')).tokens.refresh_token, 'work-token');
    assert.equal(fs.readFileSync(P.activeFile(), 'utf8'), 'work');
  });
});
