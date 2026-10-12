# claude-mods

Small, independent mods for [Claude Code](https://claude.com/claude-code): a live progress bar, a usage dashboard, a context-window meter, a safety guard, a git status band, and your own notes and todos.

Each mod is a plugin of function hooks. Install only the ones you want; none depends on another.

| Mod | Command | What it gives you |
|---|---|---|
| [**task-progress**](#task-progress) | `/progress` | A progress band above the prompt that follows the todo list, with a working timer and your usage. |
| [**usage-dashboard**](#usage-dashboard) | `/usage-dashboard` | A pane with 5h and weekly limits, models, tasks, time left and a 7-day chart. |
| [**context-meter**](#context-meter) | `/ctxmeter` | Context-window percentage in the status line, with warnings at 70% and 90%. |
| [**safety-guard**](#safety-guard) | `/safeguard` | Blocks destructive commands and writes to secret or key files before they run. |
| [**git-band**](#git-band) | `/gitband` | Branch, ahead/behind and change counts on one line above the prompt. |
| [**notes-todos**](#notes-todos) | `/mytodo`, `/mynote` | Your own todo list and notes that persist across sessions. |

## Install

Run these in a **terminal** Claude Code session. The desktop app's Code tab does not run `/plugin install`.

```
/plugin install task-progress --marketplace wablevaibhav/claude-mods
```

Answer `y` to add the marketplace the first time, then pick a scope. Repeat with any other mod name from the table:

```
/plugin install usage-dashboard --marketplace wablevaibhav/claude-mods
/plugin install context-meter --marketplace wablevaibhav/claude-mods
/plugin install safety-guard --marketplace wablevaibhav/claude-mods
/plugin install git-band --marketplace wablevaibhav/claude-mods
/plugin install notes-todos --marketplace wablevaibhav/claude-mods
```

### Try without installing

Clone the repo and point Claude Code at the mod folders:

```
git clone https://github.com/wablevaibhav/claude-mods.git
cd claude-mods
claude --plugin-dir ./task-progress --plugin-dir ./usage-dashboard
```

Add one `--plugin-dir` per mod.

## What it looks like

> `task-progress` is a real screenshot. The other previews are illustrative text with sample numbers; real colours (green / amber / red, orange accents) follow your terminal theme.

**task-progress**: the band above the prompt

![task-progress band: title, smooth bar, step list, 5h / weekly usage and active model](docs/progress-band.png)

**usage-dashboard**: the `/usage-dashboard` pane

```
Claude usage                                     updated 12s ago
╭──────────────────────────────────────────────────────────────────╮
│ 5-hour session                                  resets in 2h 10m │
│ ██████████████▌░░░░░░░░░░░░░░░░░░░░░░░░░  35%                    │
│ burning 0.40%/min · full in ~2h 5m                               │
╰──────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────╮
│ Weekly                                           resets in 4d 3h │
│ █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  12%                    │
╰──────────────────────────────────────────────────────────────────╯
● Limit risk green   session cost ~$1.42
╭──────────────────────────────────────────────────────────────────╮
│ Models                                 active: opus-5-5 (3m ago) │
│ ★ opus-5-5    ████████░░   78%    1.2M   34 msgs  ~$0.91         │
│   sonnet-5-5  ██░░░░░░░░   22%    340k   12 msgs  ~$0.18         │
│ tokens: in / out / cache = 80k / 190k / 1.3M                     │
╰──────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────╮
│ Tasks  ▸ 1 in progress   ○ 3 pending   ✓ 2 today                 │
│ ▸ Wire the charts  1m 20s                                        │
│ ○ Add the tasks board                                            │
│ ○ Polish and test                                                │
│ Time left 25m (best case 14m) · confidence medium, 4 finished    │
│ Should finish within the current 5h window.                      │
╰──────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────╮
│ Last 7 days                                                      │
│ Wed 07 ██████████████████░░░░░░░░░░░░░░░░░░░░░░  420k            │
│ Thu 08 ███████████████████████████████░░░░░░░░░  740k            │
│ Fri 09 ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  240k            │
│ Sat 10 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0               │
│ Sun 11 ██████████████████████░░░░░░░░░░░░░░░░░░  530k            │
│ Mon 12 ████████████████████████████████████████  1.0M            │
╰──────────────────────────────────────────────────────────────────╯
```

**context-meter** and **git-band** each add one line above the prompt:

```
▲ Context 78% ███████████████████░░░░░ 156k / 200k  Getting full: consider /compact soon.   [Hide]
⎇ feature/login ↑2 ↓1 ● 3 staged ✎ 2 changed ? 2 untracked
```

## The mods

### task-progress

A progress band above the prompt, visible while you type.

- **Follows your todo list by itself.** No setup: when Claude writes a todo list, the bar, step count and current step follow it.
- **A `progress` tool.** Claude can report `title`, `total`, `done`, `note`, `items` and `finished` explicitly (the tool is `mcp__task-progress__progress`), for work that doesn't use a todo list.
- **A working timer** (`⠹ Working 12s`) whenever a turn is running and no job is shown.
- **Footer:** your 5h and weekly usage with time to reset, plus the active model.
- **Controls:** `Collapse` / `Expand` hides the step list, `Hide` or `/progress` hides the band. A finished job clears when you send your next prompt.

### usage-dashboard

Open it with **`/usage-dashboard`**. (`/usage` is Claude Code's own built-in panel; this mod uses a different name so the two don't collide.)

- **Limits:** 5-hour and weekly gauges coloured green below 60%, amber from 60–85%, red above 85%, with reset times.
- **Burn rate and limit risk:** percent per minute over the last 30 minutes, when the 5h window would fill, and whether your open tasks are likely to finish first.
- **Models:** tokens by model (input, output, cache), share, messages and a rough cost, with the top consumer starred and the active model shown.
- **Tasks:** in progress, pending and done today, with a time-left estimate from the median time of tasks that finished.
- **Last 7 days:** daily tokens as bars.
- **Status line:** `5h 34% · wk 12% · opus-5-5` after your first reply.

### context-meter

- **Status line:** `ctx 43%`, the share of the context window in use.
- **Warning band** from 70%, with the token count and advice. It stays out of the way below that.
- **Toasts** once each time usage climbs into 70% and into 90%, so you compact or start fresh before quality drops.
- `/ctxmeter` hides or shows the band.

### safety-guard

Stops a call **before it runs** and tells Claude why, so it asks you first.

| Blocks | Examples |
|---|---|
| Recursive deletes of root, home or wildcards | `rm -rf /`, `rm -r ~`, `rm -rf *`, `rm -rf /etc` |
| Force pushes without a lease | `git push --force`, `git push -f` (`--force-with-lease` is allowed) |
| Piping a download into a shell | `curl … \| sh`, `wget … \| sudo bash` |
| Disk and filesystem damage | `dd … of=/dev/sda`, `mkfs.*`, `> /dev/sda`, fork bombs, `chmod -R 777` |
| Writing secrets | `.env`, `.env.production` (not `.env.example`), `*.pem`, `*.key`, `id_rsa`, service-account JSON, `.npmrc`, `.aws/credentials`, `.git/` internals |
| Reading private keys | `id_rsa`, `*.pem`, `*.key`, `.ssh/`, `.aws/credentials` |

`/safeguard` shows status and how many calls it blocked. `/safeguard pause` and `/safeguard resume` turn it off and on for the session. If the guard itself errors, it blocks the call rather than letting it through.

### git-band

- One line: branch (or `detached HEAD`), `↑ahead ↓behind` against the upstream, staged, changed and untracked counts, conflicts, or `✓ clean`.
- Refreshes after every turn and every 15 seconds. Hidden outside a git repository.
- `/gitband` hides or shows it.

### notes-todos

Your own lists, separate from Claude's todo list, stored locally and kept across sessions. The open-todo count shows in the status line.

```
/mytodo add Renew the domain      add a todo (a bare /mytodo <text> also adds)
/mytodo                           list todos
/mytodo done 2     /mytodo undo 2     /mytodo rm 2     /mytodo clear

/mynote Wifi password is on the fridge     save a note
/mynote                                    list notes
/mynote find wifi     /mynote rm 3
```

## Notes and limits

- **Usage figures** come from the rate-limit windows Anthropic reports on each reply (`five_hour`, `seven_day`). Accounts without those windows (some API-key setups) show "No reading yet".
- **Model totals, daily tokens and finished-task durations** count only turns the mod has seen since you installed it, and are kept per machine.
- **Cost** is a rough per-model price table, not a bill.
- **Task tracking** follows Claude's `TodoWrite` list. If your session uses another task tool, `task-progress` can still be driven through its `progress` tool.
- **safety-guard is a pattern-based safety net, not a security boundary.** It catches common destructive commands and secret-file writes; an unusual command can get past it.
- **Command names** avoid Claude Code built-ins such as `/usage`, `/context` and `/todos`.
- Everything runs locally and nothing is sent anywhere. `git-band` runs `git status`.

## Troubleshooting

| Problem | What to try |
|---|---|
| `/usage` shows "Session limit / Breakdown" | That is Claude Code's built-in panel. Use `/usage-dashboard`. |
| A mod's command isn't found | The mod isn't loaded. Install it, or start Claude with `--plugin-dir ./<mod>`. |
| Gauges say "No reading yet" | Send one message; the reading arrives with the first reply. |
| Band shows the old layout after an update | Close the pane and reopen it, or restart Claude. |
| A command was blocked unexpectedly | Run `/safeguard` to see why, `/safeguard pause` if you really want it. |
| `/plugin install` isn't available | Use a terminal Claude Code session, not the desktop app's Code tab. |

## Develop

```
claude plugin validate .                 # the marketplace
claude plugin validate ./<mod>           # one mod
claude plugin test ./<mod>               # its tests
```

Each mod is a folder with `.claude-plugin/plugin.json`, `hooks/hooks.json`, a hooks module, pure logic with `*.test.ts` files, and (where it keeps state) a `types/index.d.ts` contract. The marketplace file is `.claude-plugin/marketplace.json`.

Releases are git tags: `v0.2.0` added context-meter, safety-guard, git-band and notes-todos.

## License

MIT, see [LICENSE](LICENSE).
