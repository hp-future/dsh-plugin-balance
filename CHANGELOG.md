# Changelog

## 1.0.0

First public release.

- Host half: `GET /balance` (30 s cached snapshot) and `GET /balance/refresh` on the dsh
  web server, behind the composition's `connection` trust fence. The key is resolved per
  read through `credentials`, with the launch environment as the fallback.
- Client half: a balance pill in the `conversation.composer.dock` slot, polling every
  60 s and on page visibility, rendering nothing until a balance is known.
- Published to npm as `@hp-future/dsh-plugin-balance`, with a `peerDependencies` range
  (`^0.2.0-rc.2`) that fences the dsh `0.2.x` runtime line.

Changes since the pre-publication working copy:

- Renamed from the `@local/dsh-plugin-balance` template identity, in the manifest, the
  bundle patch, and the client module-loader id.
- Removed the development probe that wrote `window.__dshBalance`.
- Declared `launchEnvironment` in the host `inject` list, so the documented ambient
  environment fallback actually resolves.
