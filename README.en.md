# codexp

Manage multiple **OpenAI Codex CLI** accounts (`auth.json`) — login, switch, track usage.

- **Zero dependencies** — Node 18+ stdlib only.
- Profiles auto-named by account email.
- Usage tracking (5h / weekly limits) with smart caching — no API spam.

> [!WARNING]
> Codex CLI loads `auth.json` once at startup. **Exit Codex before switching profiles**,
> otherwise the running session keeps the old token. `codexp` warns you if a `codex`
> process is detected.

## Install

```bash
npm install -g codexp-cli
```

Or from source:

```bash
git clone https://github.com/MaiHongPhong1902/codexp.git
cd codexp
npm link
```

## Commands

```text
codexp                          # interactive shell (shows profiles + usage)
codexp login                    # login new account (auto-named by email)
codexp use     <name>           # switch to a profile
codexp refresh <name>           # re-login to refresh tokens
codexp remove  <name>           # delete a profile
codexp list                     # show all profiles (reads cached usage)
codexp status  [name]           # fetch live usage from API
```

Flags:

- `--home <path>` — override Codex home (default: `$CODEX_HOME` or `~/.codex`)
- `--force` — skip running-process warning

## What it shows

```
  ● user_gmail_com  USABLE  [LIVE]
      account : user@gmail.com (plus)
      id      : f481ede4-fef4-44cd-af14-498e859ffe17
      access  : in 9d 18h (2026-05-13 11:46Z)
      refresh : -
      last refresh: 2026-05-03 11:46Z
      5h limit: ████████████████████ 100% left (resets in 4h 52m)
      weekly  : ███████████████████░ 97% left (resets in 6d 18h)
```

- **account** — email decoded from JWT `id_token`
- **plan** — plus, pro, team, etc.
- **access / refresh** — token expiry countdown
- **5h limit / weekly** — usage remaining (from cache)
- **USABLE** / **EXPIRED** — whether tokens are still valid
- **● [LIVE]** — matches the current `auth.json`

### Usage caching

| Action | API call? | Caches? |
|---|---|---|
| `login` | Yes | Yes |
| `use` (switch) | Yes | Yes |
| `status` | Yes | Yes |
| `list` | No | Reads cache |

When `reset_at` has passed, `list` automatically shows 100% without calling the API.

## Quick start

```bash
# 1. Login first account
codexp login               # browser opens → saves as user_gmail_com.json

# 2. Login another account
codexp login               # different account → different profile name

# 3. Open shell to see everything
codexp                     # profiles + usage + interactive prompt

# 4. Switch (exit codex first!)
codexp use other_email_com
codex                      # starts Codex with the new account
```

## Project structure

```
codexp/
├── bin/codex-profile.js     # CLI entry point
├── src/
│   ├── auth.js              # JWT decoding, expiry math
│   ├── colors.js            # ANSI color helpers
│   ├── commands.js          # all commands
│   └── paths.js             # path resolution (CODEX_HOME, profiles dir)
├── profiles/                # profile data (gitignored)
│   ├── <email>.json         # saved auth.json snapshots
│   ├── .active              # currently active profile
│   ├── .backup.json         # backup before last switch
│   └── .usage-cache.json    # cached usage data
├── codex-profile.cmd        # Windows wrapper
├── package.json
├── LICENSE
└── README.md
```

## Security

`profiles/*.json` contain **OAuth refresh tokens** — treat them like passwords.
Never commit or share them. The included `.gitignore` excludes all profile data.

## License

[MIT](LICENSE)
