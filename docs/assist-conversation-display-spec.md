# Assist Conversation Display Spec

Status: stable V1 release.

Last consolidated: 2026-08-12.

## Goal

Build a Home Assistant custom integration and dashboard card that display the current room-local Assist conversation for a selected `assist_satellite.*` entity in an iMessage-like bubble interface.

The target experience is a Streaming Displayed Conversation: show the user listening state, show intermediate assistant text while the assistant is responding, then replace the in-flight assistant bubble with the final response when Home Assistant emits it.

## Non-Goals

- Do not store voice transcripts in recorder/history by default.
- Do not create transcript entities.
- Do not add MACS-style manual `send_user_message` or `send_assistant_message` actions.
- Do not guess the originating satellite for runs without explicit satellite attribution.
- Do not build auto-room matching in V1; the card requires an explicit `assist_satellite_entity`.

## Packaging

Ship as one HACS Integration repository under `custom_components/assist_chat_display/`.

The dashboard card is bundled inside the integration and served by Home Assistant. Use `hass.http.async_register_static_paths` with `StaticPathConfig`; do not use deprecated `register_static_path`.

Storage-mode dashboards get an automatically registered card resource. YAML-mode dashboards need documented manual resource configuration.

The versioned card resource URL is:

```text
/assist_chat_display/assist-chat-display-card.js?v=<manifest version>
```

## Architecture

The backend is the Assist Transcript Broker. It captures and normalizes Assist activity, enforces access rules, serves Recent Transcript Snapshots, and streams Transcript Deltas.

The card is a Transcript Consumer. It renders the selected satellite's Displayed Conversation and keeps the Browser Transcript Cache for the current browser session.

The card must not parse raw Home Assistant Assist pipeline debug events. It consumes the broker's normalized schema only.

## Capture Strategy

For passive display of existing satellites, use backend-side adaptive polling of Home Assistant's in-memory Assist pipeline debug runs.

The broker subscribes to state changes for watched Assist Satellites. When a satellite enters or leaves active states such as `listening`, `processing`, or `responding`, the state change wakes the poll loop immediately instead of waiting for the idle timer. The integration polls around 100-200 ms while active, slows after idle, and coalesces browser updates to avoid UI churn.

Satellite state changes are only wakeup signals. Displayed Conversation messages still come from real Assist debug run data, not synthetic satellite state placeholders.

WebSocket subscription poll loops are Home Assistant background tasks. They may live as long as a browser keeps the card open and must not block Home Assistant startup.

Current Home Assistant does not expose passive Assist pipeline events as ordinary event-bus events. The built-in Assist chat gets live events because it starts its own pipeline run through `assist_pipeline/run`; that is not the same problem as observing a Voice PE or other existing satellite.

Unattributed Assist Runs are ignored for satellite-specific cards. The integration should log a debug warning/count, not infer attribution from pipeline id or conversation id.

## Retention

The backend is not transcript history. It can reconstruct only a Recent Transcript Snapshot from current Home Assistant in-memory Assist debug data.

The browser keeps its own Browser Transcript Cache for messages it has already observed while open. If the dashboard reloads, it can only rebuild from the current Recent Transcript Snapshot.

On load, the card applies a Snapshot Freshness Limit before hydrating from an initial snapshot. The default limit is 300 seconds. Older snapshots are ignored so dashboards do not show stale conversations indefinitely.

## Access Control

Users may read transcripts only for selected Assist Satellites they can read. Integration options and setup remain admin-only.

If Home Assistant's current permission helpers do not allow this cleanly, prefer stricter access over broader access.

## Backend API

Expose both:

- WebSocket subscription for the card.
- Response-only Home Assistant action `assist_chat_display.get_transcript` for scripts and alternate consumers.

Register the action in `async_setup` and use `SupportsResponse.ONLY`. The action returns a Recent Transcript Snapshot and raises Home Assistant exceptions for invalid input or unavailable runtime data.

No `clear_display` action in V1 because display clearing is frontend-only without backend retention.

## Snapshot Schema

```json
{
  "assist_satellite_entity": "assist_satellite.living_room",
  "generated_at": "2026-08-11T10:15:30Z",
  "source": "assist_debug_cache",
  "messages": [
    {
      "id": "run_abc:user",
      "run_id": "run_abc",
      "role": "user",
      "text": "Turn on the kitchen lights",
      "status": "final",
      "created_at": "2026-08-11T10:15:01Z",
      "updated_at": "2026-08-11T10:15:01Z"
    },
    {
      "id": "run_abc:assistant",
      "run_id": "run_abc",
      "role": "assistant",
      "text": "Turning on the kitchen lights.",
      "status": "final",
      "created_at": "2026-08-11T10:15:02Z",
      "updated_at": "2026-08-11T10:15:02Z"
    }
  ]
}
```

Message fields:

- `id`: stable message id, usually derived from run id and role.
- `run_id`: Home Assistant Assist pipeline run id when available.
- `role`: `user` or `assistant`.
- `text`: display text.
- `status`: `placeholder`, `streaming`, `final`, or `error`.
- `created_at`: first known timestamp.
- `updated_at`: most recent normalized update timestamp.
- `details`: optional object for thinking content, tool calls, tool results, error detail, and debug data behind a debug flag.

## Delta Schema

The WebSocket subscription returns an initial snapshot, then deltas.

For Home Assistant frontend `subscribeMessage` consumers, the subscription also emits the initial snapshot as the first event:

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
    "id": "run_def:assistant",
    "run_id": "run_def",
    "role": "assistant",
    "text": "Let me check that...",
    "status": "streaming",
    "updated_at": "2026-08-11T10:16:04Z"
  }
}
```

Final replacement uses the same id:

```json
{
  "type": "message_replace",
  "message": {
    "id": "run_def:assistant",
    "run_id": "run_def",
    "role": "assistant",
    "text": "The garage door is closed.",
    "status": "final",
    "updated_at": "2026-08-11T10:16:06Z"
  }
}
```

## UI Behavior

- Show one continuous conversation per Assist Satellite.
- Show subtle Run Boundaries only when useful.
- Show a Listening Placeholder when the satellite starts listening.
- Replace the placeholder with `stt-end.data.stt_output.text` when speech-to-text completes.
- Update the In-Flight Assistant Bubble from `intent-progress.data.chat_log_delta`.
- Replace the in-flight assistant text with the final `intent-end` speech string.
- Show an Assistant Activity Indicator with animated dots when the assistant is active but has no visible response text yet.
- Show speech bubbles by default.
- Implement speech bubbles with project-owned CSS instead of copying Home Assistant's internal Assist chat component or any internal bubble markup.
- Render visible message text with Home Assistant's `ha-markdown` component in V1, accepting the higher update burden for Markdown support.
- If `ha-markdown` is unavailable, fall back to safe plain-text rendering with preserved whitespace and log one browser warning.
- Use a transparent card background so the dashboard section background remains visible.
- Default to blue user bubbles and green assistant bubbles, exposed through project-owned CSS variables with Home Assistant theme fallbacks.
- Support Display Scale through a `display_scale` card option. It is a percentage with default `100`, clamped to `75` through `250`, and scales text, bubbles, spacing, radius, activity indicators, and bubble pixel width caps without changing transcript data or dashboard grid size.
- Expose Display Scale as `--assist-chat-display-scale` so theme/uix/card-mod style overrides can still fine-tune or replace the generated sizes.
- Support Card Height Policy through `height_mode` with values `default`, `viewport`, and `custom`.
- In `default` height mode, the dashboard controls card height. This is the recommended mode for Sections dashboards, where users should size the card through Home Assistant's layout controls.
- In `viewport` height mode, the card fills the remaining visible viewport from its current top edge, using `window.visualViewport.height` with `window.innerHeight` fallback. Recompute on resize and visual viewport changes, and clamp to a minimum of 240 px. This mode is intended for Panel dashboards and other full-height surfaces.
- In `custom` height mode, apply the optional `height` string as a CSS height value. Empty or missing `height` falls back to dashboard-controlled height. Do not implement a custom CSS parser.
- Keep thinking/tool-call details in the data model. Do not expose them in the normal V1 room UI; a later optional expandable detail view can follow Home Assistant's Assist chat pattern with smaller fixed-width formatting for tool data.
- Auto-scroll when new messages arrive if the user is already near the bottom, keep following the bottom during active updates, and force scroll on initial snapshots and new active voice interactions.
- Keep the Browser Transcript Cache bounded; default `max_messages` is 20, with validated user configuration.
- Support optional frontend-only inactivity clearing through `clear_after`, defaulting to `0` meaning disabled.
- Keep the card header optional and disabled by default for wall-tablet layouts.
- Reconnect WebSocket subscriptions automatically with backoff after connection loss or Home Assistant restart.
- Show compact English errors inside the card for connection, permission, integration, and invalid-entity failures.
- Keep the empty state empty with no header and no explanatory text.
- On Assist errors, keep the user bubble and show a compact Assist Error Bubble with technical details expandable.
- If the backend cannot access required Assist debug data, show an Unsupported Assist Transcript State instead of stale data.

## Card Configuration

```yaml
type: custom:assist-chat-display-card
entity: assist_satellite.living_room
display_scale: 100
height_mode: default
height: ""
max_messages: 20
max_initial_age: 300
clear_after: 0
show_header: false
```

The V1 card defines `getConfigForm`, `getStubConfig`, `getCardSize`, `getGridOptions`, and a `window.customCards` entry with `getEntitySuggestion` for `assist_satellite.*` entities.

Display Scale uses Home Assistant's standard number slider selector in the visual editor. This keeps the editor aligned with Home Assistant defaults, including the selector's built-in numeric input.

Card Height Policy uses Home Assistant's standard form controls. Show `height_mode` as a select control with user-facing labels for Section dashboard / Default, Panel dashboard / Full height, and Custom height. Show `height` as an optional text field; it is used only when `height_mode` is `custom`.

## Release Contents

- Custom integration skeleton for `assist_chat_display`.
- Source-baseline checks against Home Assistant Core `2026.8.1` and Frontend `20260729.6`.
- Backend capture module that accepts an `assist_satellite_entity` parameter.
- In-memory Assist debug run reader filtered by `run-start.data.satellite_id`.
- Transcript normalization for visible user/assistant messages, streaming progress, final replacement, compact errors, and the streaming TTS marker.
- Debug logging for normalized transcript deltas.
- WebSocket subscription that returns an initial snapshot and streams subsequent deltas.
- `assist_chat_display.get_transcript` response-only action.
- Bundled `custom:assist-chat-display-card` dashboard card.
- Setup-only config flow so the integration can be loaded through Home Assistant's UI.
- Graphical card config form and card picker suggestion for `assist_satellite.*` entities.

The V1 release includes a minimal setup-only config flow so the integration can be loaded through Home Assistant's UI without YAML. It does not store satellite configuration; each WebSocket/action caller still provides `assist_satellite_entity`.

## Risks

- Home Assistant Assist debug internals may change. Re-check current source before implementation changes.
- Debug retention is limited to recent in-memory runs; this project deliberately does not create a backend transcript history.
- Polling must be adaptive and coalesced to avoid unnecessary CPU and UI churn.
- Permission checks must be revalidated against current Home Assistant helpers when access-control behavior changes.
- Streaming semantics may differ across Assist providers, LLMs, tools, and streaming TTS configurations.

## Source Baseline

Current checked baseline is Home Assistant Core `2026.8.1`, published 2026-08-07, with Home Assistant Frontend `20260729.6`, published 2026-08-07.

Keep `docs/sources/home-assistant.md`, `docs/sources/hacs.md`, and `docs/sources/macs.md` current when implementation touches the assumptions captured here.
