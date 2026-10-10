# dsh-plugin-balance

English | [中文](README.zh.md) | [npm](https://www.npmjs.com/package/@hp-future/dsh-plugin-balance)

Shows your DeepSeek account balance in the dsh composer status row, next to the token and cache pills.

## Install

```
plugin_manager → install_bundle → @hp-future/dsh-plugin-balance
```

Or from a terminal:

```bash
dsh plugin --profile web add @hp-future/dsh-plugin-balance
```

Reload the page afterwards. To uninstall:

```bash
dsh plugin --profile web remove @hp-future/dsh-plugin-balance
```

## Configuration

The balance is read from `https://api.deepseek.com/user/balance`, using the same `DEEPSEEK_API_KEY`
reference the DeepSeek inference adapter uses. A key already configured for chat works as is.

If you have no credential store, export the variable before launching dsh instead:

```bash
export DEEPSEEK_API_KEY=sk-...          # PowerShell: $env:DEEPSEEK_API_KEY = 'sk-...'
```

## Requirements

- dsh `0.2.x`
- A Web profile
- A DeepSeek API key

## Version compatibility

The plugin declares `"@deepseek-ai/dsh": "^0.2.0-rc.2"` as a peer dependency, which covers every
`0.2.x` release including prereleases. dsh checks this before installing, so you will get a clear
refusal instead of a plugin that half-works on an untested release.

Running it outside that range is possible but discouraged — the composer slot API it uses is not
covered by a stable contract. If you want to try anyway, dsh prints the exemption command in the
refusal:

```bash
dsh plugin --profile web allow-version @hp-future/dsh-plugin-balance@1.0.0 \
  --dsh-version <runtime> --accept-risk
```

## Troubleshooting

**The pill never appears.** Check `GET /balance` in your browser devtools. A `code` of
`no-credential` means no key was found; other codes report the upstream failure.

**The pill disappears after showing a value.** A failed read hides the pill rather than displaying
a stale number. The next successful poll (within 60 seconds) brings it back.

**The plugin shows as installed but inactive.** The profile is missing one of the host services it
depends on: `webServer`, `connection`, `credentials`, `launchEnvironment`. dsh keeps such a plugin
inactive instead of failing loudly.

## Development

Plain JavaScript, no build step, no runtime dependencies. Both halves have a harness that runs
without starting dsh:

```bash
node verify/verify-host.mjs      # registers the routes and reads the live balance endpoint
node verify/verify-client.mjs    # drives the client half against a slot double
```

Set `DEEPSEEK_API_KEY` before running the host harness to also check the live payload.

## License

MIT
