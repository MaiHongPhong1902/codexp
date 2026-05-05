#!/usr/bin/env node
'use strict';

const cmds = require('../src/commands');
const c = require('../src/colors');

function parseArgs(argv) {
  const out = { positional: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--home' || a === '-H') { if (i + 1 >= argv.length) throw new Error('--home requires a path argument.'); out.opts.home = argv[++i]; }
    else if (a.startsWith('--home=')) { out.opts.home = a.slice(7); }
    else if (a === '--force' || a === '-f') { out.opts.force = true; }
    else if (a === '--help' || a === '-h') { out.opts.help = true; }
    else if (a === '--version' || a === '-V') { out.opts.version = true; }
    else { out.positional.push(a); }
  }
  return out;
}

function help() {
  const u = c.bold;
  console.log(`
${u('codexp')} - manage multiple Codex CLI auth.json profiles

${u('USAGE')}
  codexp <command> [args] [--home <path>] [--force]

${u('COMMANDS')}
  ${u('shell')}                      Interactive REPL (default when run with no args in a TTY)
  ${u('login')}   <name>             Run 'codex login' in isolation, save result to profiles/<name>.json
  ${u('refresh')} <name>             Re-login to an existing profile to refresh access/refresh tokens
  ${u('save')}    <name>             Snapshot current auth.json (already-logged-in) into profiles/<name>.json
  ${u('list')}                       Show all profiles with usability/expiry status
  ${u('use')}     <name>             Replace <CODEX_HOME>/auth.json with profile <name>
  ${u('status')}  [name]             Fetch live usage/status from API for a profile (or current if no name)
  ${u('current')}                    Print which saved profile matches the live auth.json
  ${u('rename')}  <old> <new>        Rename a profile
  ${u('remove')}  <name>             Delete a profile
  ${u('restore')}                    Revert auth.json to the auto-backup made by last 'use'
  ${u('where')}                      Print resolved paths
  ${u('help')}                       Show this help

${u('OPTIONS')}
  --home <path>    Override CODEX_HOME (default: \$env:CODEX_HOME or ~/.codex)
  --force, -f      Overwrite existing profile / switch even if codex is running
  --version, -V    Print version

${u('ENV')}
  CODEX_HOME           Codex home folder (contains auth.json)
  CP_PROFILES_DIR      Override profiles directory (default: per-user codexp data dir)
  NO_COLOR             Disable colored output

${u('EXAMPLES')}
  codexp login work
  codexp refresh work                         # refresh tokens for 'work'
  codexp login personal
  codexp list
  codexp use personal
  codexp status                               # check current usage
  codexp use work --home "%USERPROFILE%\\.codex"
`);
}

(async () => {
  const argv = process.argv.slice(2);
  const { positional, opts } = parseArgs(argv);

  if (opts.version) { console.log(require('../package.json').version); return; }
  if (opts.help && positional.length === 0) { help(); return; }

  // No args + interactive terminal -> launch shell. Otherwise default to `list`.
  if (positional.length === 0) {
    if (process.stdout.isTTY && process.stdin.isTTY) {
      positional.push('shell');
    } else {
      positional.push('list');
    }
  }

  try {
    await cmds.dispatch(positional, opts, help);
  } catch (err) {
    console.error(c.red('Error: ') + (err && err.message ? err.message : String(err)));
    process.exit(1);
  }
})();
