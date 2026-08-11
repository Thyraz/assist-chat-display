# Expose a normalized transcript API

The Assist Transcript Broker exposes Recent Transcript Snapshots and Transcript Deltas using stable project-owned JSON shapes instead of leaking raw Home Assistant Assist debug events to the dashboard card. This keeps Home Assistant's fast-moving internal event model behind one backend boundary while allowing the card and HA actions to consume boring `messages[]` data with stable ids, roles, text, status, timestamps, and optional details.

## Consequences

- The bundled card should not parse raw Home Assistant Assist pipeline events.
- The `assist_chat_display.get_transcript` action returns a Recent Transcript Snapshot only.
- The WebSocket subscription returns an initial Recent Transcript Snapshot followed by Transcript Deltas.
- V1 uses logs for diagnostics; no transcript entities or diagnostic sensors are created by default.
