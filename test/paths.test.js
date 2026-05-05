'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const P = require('../src/paths');

function withProfilesDir(fn) {
  const previous = process.env.CP_PROFILES_DIR;
  const root = fs.mkdtempSync(path.join(process.cwd(), '.test-tmp-paths-'));
  process.env.CP_PROFILES_DIR = path.join(root, 'profiles');
  try {
    return fn(root);
  } finally {
    if (previous == null) delete process.env.CP_PROFILES_DIR;
    else process.env.CP_PROFILES_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('profileFile keeps valid profile names inside profilesDir', () => {
  withProfilesDir(() => {
    const base = path.resolve(P.profilesDir());
    const file = P.profileFile('work_1.2-3');

    assert.equal(file, path.join(base, 'work_1.2-3.json'));
    assert.equal(path.dirname(file), base);
  });
});

test('profileFile rejects traversal and hidden file names', () => {
  withProfilesDir(() => {
    for (const name of ['..', '../outside', '..\\outside', '.active', '/abs', 'x/y', 'x\\y', '', '-bad']) {
      assert.throws(() => P.profileFile(name), /Invalid profile name|Profile name is required/);
    }
  });
});

test('default profilesDir is per-user data, not package-local profiles', () => {
  const previous = process.env.CP_PROFILES_DIR;
  delete process.env.CP_PROFILES_DIR;
  try {
    const dir = P.profilesDir();
    assert.notEqual(dir, path.resolve(__dirname, '..', 'profiles'));
    assert.equal(path.basename(dir), 'profiles');
    assert.equal(path.basename(path.dirname(dir)), 'codexp');
    assert.ok(dir.startsWith(os.homedir()) || dir.includes('codexp'));
  } finally {
    if (previous == null) delete process.env.CP_PROFILES_DIR;
    else process.env.CP_PROFILES_DIR = previous;
  }
});
