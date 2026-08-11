# MACS Source Review

Last checked: 2026-08-10.

Repository: https://github.com/glyndavidson/MACS

## Version Checked

- MACS integration version: `1.0.10`
- HACS minimum Home Assistant version: `2025.12.4`

## Relevant Files Checked

- `custom_components/macs/__init__.py`
- `custom_components/macs/const.py`
- `custom_components/macs/services.yaml`
- `custom_components/macs/www/backend/MacsCard.js`
- `custom_components/macs/www/backend/assistPipeline.js`
- `custom_components/macs/www/backend/assistSatellite.js`
- `custom_components/macs/www/frontend/scripts/assist-bridge.js`
- `custom_components/macs/www/shared/constants.js`

## Findings Relevant To This Project

- MACS packages a custom integration and bundled Lovelace card together, serves `custom_components/macs/www` at `/macs`, and auto-registers `/macs/macs.js` as a dashboard resource.
- MACS uses `hass.http.async_register_static_paths` with `StaticPathConfig`.
- MACS tracks an Assist Satellite entity state in the card frontend and maps states such as `listening`, `processing`, and `responding` into character moods.
- MACS does not receive passive live Assist pipeline callbacks from Home Assistant core.
- MACS card-side code calls `assist_pipeline/pipeline_debug/list` and `assist_pipeline/pipeline_debug/get` through the user's frontend WebSocket session.
- MACS triggers debug fetches from `conversation.home_assistant` state changes, not from the configured `assist_satellite.*` entity.
- MACS extracts only completed turn data from debug events: user text from `intent-start` or `stt-end`, assistant text from `intent-end`, and errors from `error`.
- MACS does not process `intent-progress.data.chat_log_delta`, so it does not appear to implement streaming/intermediate Assist text behavior.
- MACS also exposes `macs.send_user_message` and `macs.send_assistant_message`; these services fire a custom `macs_message` event that the card subscribes to and renders as synthetic bubbles.

## Takeaways

MACS proves that a custom integration can bundle and auto-register a card, and that a card can read Assist pipeline debug data via frontend WebSocket commands. Its capture model is not the target architecture here because it is card-side, pipeline-id based, hard-coded to `conversation.home_assistant` for refresh triggers, and completed-turn oriented.
