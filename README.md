# @hp-future/dsh-plugin-balance

English | [中文](README.zh.md)

A [dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) (DeepSeek Harness) plugin that shows the **DeepSeek account balance** as a pill in the composer status row, next to the token and cache pills.

## What it does

- **Host half** — registers `GET /balance` (cached snapshot, 30 s TTL) and `GET /balance/refresh` (forces a fresh read) on the dsh web server, behind the composition's own `connection` trust fence. The API key is resolved per read through the `credentials` service, so a rotated key applies to the next read with no restart.
- **Client half** — registers one entry into the `conversation.composer.dock` slot. It polls every 60 s, refreshes when the page becomes visible, and renders nothing at all until a balance is actually known (an absent pill is honest; `0` is not).

The API key never leaves the host process: both routes answer account facts only, never the credential.

## Install

In any dsh Web profile, install the published bundle by name. Either ask your agent to run the plugin manager:

> `plugin_manager`, `action: install_bundle`, `target: @hp-future/dsh-plugin-balance`

or use the CLI, which forwards to pnpm inside the profile:

```bash
dsh plugin --profile web add @hp-future/dsh-plugin-balance
```

Installation selects the bundle; the pill appears after the page reloads. To remove it:

```bash
dsh plugin --profile web remove @hp-future/dsh-plugin-balance
```

## Requirements

| Requirement | Why |
|---|---|
| dsh `0.2.x` (`^0.2.0-rc.2`) | The client half is built against this line's slot and module-loader contract. |
| A **Web** profile | The plugin registers routes on `webServer` and renders into a web slot. |
| A **DeepSeek** credential | The balance comes from `https://api.deepseek.com/user/balance`. |

### Credential

The key is read through the host's `credentials` service first — the same reference
(`DEEPSEEK_API_KEY`) the DeepSeek inference adapter reads, so a key already configured
for chat needs no extra setup. If no credential store is mounted, the plugin falls back
to the ambient launch environment, which means exporting the variable also works:

```bash
export DEEPSEEK_API_KEY=sk-...   # PowerShell: $env:DEEPSEEK_API_KEY = 'sk-...'
```

Without a key the routes answer `{"ok":false,"code":"no-credential",...}` and the pill
simply does not render.

## Version compatibility

dsh refuses to install or activate a plugin whose `peerDependencies` do not admit the
running runtime. This plugin declares:

```json
"peerDependencies": { "@deepseek-ai/dsh": "^0.2.0-rc.2" }
```

which accepts every `0.2.x` runtime (prereleases included, because dsh evaluates peers
with `includePrerelease: true`) and refuses `0.3.0` and later. A refusal is deliberate:
the client half uses slot and module-loader APIs that are not part of a stable public
contract, so an unverified runtime is refused rather than trusted.

If you knowingly want to run it on a runtime outside that range, dsh provides an
exact-version exemption and will tell you the exact command in the refusal:

```bash
dsh plugin --profile web allow-version @hp-future/dsh-plugin-balance@1.0.0 \
  --dsh-version <runtime> --accept-risk
```

That grants the risk of crashes or data loss to you; it is not a compatibility claim.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No pill, no error | No DeepSeek credential resolved, or `GET /balance` returned a non-OK status. Check the browser console and the `/balance` response. |
| Plugin row exists but inactive | The profile is missing one of `webServer`, `connection`, `credentials`, `launchEnvironment`. Cordis keeps a plugin inactive while a declared service is absent; it is not a crash. |
| Pill appears then disappears | A failed read publishes `phase: 'failed'`, which renders nothing. The next successful poll brings it back. |

`window.__dshBalance` is not set by this plugin; the earlier development probe was removed in 1.0.0.

## Development

The plugin is plain JavaScript with no build step and no runtime dependencies. Two
scoped harnesses drive both halves without starting a harness process:

```bash
node verify/verify-host.mjs      # registers routes, calls the live balance endpoint
node verify/verify-client.mjs    # drives the client half against a slot double
```

`verify/` is not published (see `files` in `package.json`).

## License

[MIT](LICENSE)
