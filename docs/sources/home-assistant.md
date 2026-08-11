# Home Assistant Source Baseline

Last checked: 2026-08-11.

## Current Baseline

- Home Assistant Core latest release: `2026.8.1`, published 2026-08-07.
- Bundled Home Assistant Frontend in Core `2026.8.1`: `20260729.6`.
- Home Assistant Frontend latest release: `20260729.6`, published 2026-08-07.

## Source Files Checked

- `homeassistant/components/assist_pipeline/pipeline.py`
- `homeassistant/components/assist_pipeline/websocket_api.py`
- `homeassistant/components/assist_satellite/entity.py`
- `frontend/src/components/ha-assist-chat.ts`
- `frontend/src/data/assist_pipeline.ts`
- `frontend/src/dialogs/voice-command-dialog/ha-voice-command-dialog.ts`
- `homeassistant/components/lovelace/resources.py`
- `homeassistant/components/lovelace/const.py`
- Home Assistant developer docs for Assist satellite entities, Conversation entities, WebSocket APIs, service actions with response data, and frontend/custom card APIs.

## Findings Relevant To This Project

- Assist pipeline events are delivered to the pipeline runner callback and stored in the pipeline debug cache; they are not exposed as ordinary Home Assistant bus events.
- `AssistSatelliteEntity.async_accept_pipeline_from_satellite` passes `satellite_id` into pipeline runs, and `run-start` events can include that `assist_satellite.*` entity id.
- Pipeline debug access is available through admin-only WebSocket commands and currently retains the last 10 runs per pipeline in memory.
- The built-in Assist chat uses `intent-progress` events containing `chat_log_delta` to update an in-flight assistant message, then uses `intent-end` to replace the visible text with the final response.
- The built-in Assist chat receives these events by starting its own pipeline run through the `assist_pipeline/run` WebSocket subscription. That path is not a passive observer API for existing `assist_satellite.*` runs started by devices such as Voice PE.
- Current frontend types include `chat_log_delta`, `thinking_content`, `tool_calls`, `tool_result`, and `tts_start_streaming` on Assist pipeline progress events.
- Service actions can return JSON-serializable response data with `SupportsResponse.ONLY`; service actions should be registered in `async_setup`.
- Custom cards are custom elements and can define `getConfigForm`, `getStubConfig`, `getCardSize`, and `getGridOptions`.
- Custom card picker suggestions use `window.customCards[].getEntitySuggestion`, available since Home Assistant `2026.6`.
- `home-assistant-js-websocket` `subscribeMessage` resolves to an unsubscribe function and delivers subscription payloads through the callback. For this project, the initial snapshot is therefore also sent as the first subscription event.
- Lovelace storage-mode resources are managed through `hass.data[LOVELACE_DATA].resources`; YAML resource mode must be documented instead of mutated.

## Update Rule

Before implementing or changing Assist capture behavior, re-check the current Home Assistant Core and Frontend releases and compare these files against this baseline. Home Assistant voice internals move quickly, so old assumptions in this file are not enough.

When local diffs are useful, clone Home Assistant repositories into a repo-local ignored temporary folder, keep one old source copy only while comparing, and delete the old copy after the update review is complete.
