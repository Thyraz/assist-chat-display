# Backend

Status: stable V1 release.

## What Exists

- Custom integration skeleton under `custom_components/assist_chat_display/`.
- Minimal setup-only config flow to load the integration in Home Assistant.
- `assist_chat_display.get_transcript` response-only action.
- `assist_chat_display/subscribe` WebSocket command.
- Backend Assist Transcript Broker with adaptive polling while a satellite is active or a transcript message is in-flight.
- Pure transcript normalizer with unit tests.
- Bundled `custom:assist-chat-display-card` served from the integration.
- Automatic Lovelace resource registration for storage-mode dashboards.

## Action Usage

Use the action with an Assist Satellite entity id:

```yaml
action: assist_chat_display.get_transcript
data:
  assist_satellite_entity: assist_satellite.living_room
response_variable: transcript
```

The response is a Recent Transcript Snapshot:

```json
{
  "assist_satellite_entity": "assist_satellite.living_room",
  "generated_at": "2026-08-11T10:15:30Z",
  "source": "assist_debug_cache",
  "messages": []
}
```

## WebSocket Usage

Subscribe with:

```json
{
  "id": 42,
  "type": "assist_chat_display/subscribe",
  "assist_satellite_entity": "assist_satellite.living_room"
}
```

The command result is the initial Recent Transcript Snapshot. The subscription also sends that snapshot as the first WebSocket event so Home Assistant frontend `subscribeMessage` consumers can hydrate without reading the command result. Subsequent WebSocket events are Transcript Deltas:

```json
{
  "type": "snapshot",
  "snapshot": {
    "assist_satellite_entity": "assist_satellite.living_room",
    "generated_at": "2026-08-11T10:15:30Z",
    "source": "assist_debug_cache",
    "messages": []
  }
}
```

```json
{
  "type": "message_update",
  "message": {
    "id": "run_abc:assistant",
    "run_id": "run_abc",
    "role": "assistant",
    "text": "Let me check...",
    "status": "streaming",
    "created_at": "2026-08-11T10:15:02Z",
    "updated_at": "2026-08-11T10:15:03Z"
  }
}
```

## Card Usage

Storage-mode dashboards should get the card resource automatically:

```yaml
type: custom:assist-chat-display-card
entity: assist_satellite.living_room
max_messages: 20
max_initial_age: 300
clear_after: 0
show_header: false
```

YAML-mode dashboards need the resource configured manually:

```yaml
resources:
  - url: /assist_chat_display/assist-chat-display-card.js?v=1.0.0
    type: module
```

## Debug Logging

Transcript deltas are logged at debug level because voice transcripts are sensitive:

```yaml
logger:
  logs:
    custom_components.assist_chat_display: debug
```

## Current Limits

- No persistent backend transcript history.
- No transcript entities or diagnostic sensors.
- The backend reads Home Assistant's current in-memory Assist debug runs, which are limited to recent runs and are cleared on restart.
- Runs without `run-start.data.satellite_id` are ignored for satellite-specific transcripts.
- Thinking/tool details are kept in the data model but not exposed in the V1 room UI.
- Implementation was checked against Home Assistant Core `2026.8.1` and Frontend `20260729.6`; re-check source before changing Assist capture behavior.
