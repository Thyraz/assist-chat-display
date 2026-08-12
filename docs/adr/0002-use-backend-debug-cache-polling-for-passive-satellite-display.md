# Use backend debug-cache polling for passive satellite display

For existing Home Assistant `assist_satellite.*` entities, this project will use backend-side adaptive polling of Home Assistant's in-memory Assist pipeline debug runs as the first passive capture strategy. The built-in Assist chat receives live events only for pipeline runs it starts itself, and MACS' card-side debug polling is useful precedent but does not provide satellite-filtered streaming semantics.

## Consequences

- The browser card subscribes to this integration's WebSocket API instead of calling Home Assistant Assist debug WebSocket commands directly.
- Poll loops are Home Assistant background tasks because they can live as long as a browser subscription and must not block Home Assistant startup.
- Polling starts immediately on subscribe, wakes on watched Assist Satellite state changes, and accelerates while satellites are in active states such as `listening`, `processing`, or `responding`.
- Satellite state changes are not converted into transcript messages; they only wake the debug-cache poll loop.
- The backend normalizes Assist events, including `intent-progress.data.chat_log_delta`, before sending transcript events to Transcript Consumers.
- This depends on Home Assistant internals and must be re-checked against the current Home Assistant source before implementation changes.
