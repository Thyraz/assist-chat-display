# Use backend debug-cache polling for passive satellite display

For existing Home Assistant `assist_satellite.*` entities, this project will use backend-side adaptive polling of Home Assistant's in-memory Assist pipeline debug runs as the first passive capture strategy. The built-in Assist chat receives live events only for pipeline runs it starts itself, and MACS' card-side debug polling is useful precedent but does not provide satellite-filtered streaming semantics.

## Consequences

- The browser card subscribes to this integration's WebSocket API instead of calling Home Assistant Assist debug WebSocket commands directly.
- Polling starts or accelerates when watched Assist Satellites enter active states such as `listening`, `processing`, or `responding`.
- The backend normalizes Assist events, including `intent-progress.data.chat_log_delta`, before sending transcript events to Transcript Consumers.
- This depends on Home Assistant internals and must be re-checked against the current Home Assistant source before implementation changes.
