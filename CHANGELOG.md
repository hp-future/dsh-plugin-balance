# Changelog

## 1.0.0

- Balance pill in the composer status row (`conversation.composer.dock`), polling every 60 s and on page visibility.
- `GET /balance` (30 s cached) and `GET /balance/refresh` on the dsh web server, behind the `connection` trust fence.
- API key resolved per read through `credentials`, falling back to the launch environment.
- Peer dependency on `@deepseek-ai/dsh` `^0.2.0-rc.2`.
