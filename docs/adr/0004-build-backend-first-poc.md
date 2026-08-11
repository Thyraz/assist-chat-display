# Build a backend-first POC

The first proof of concept will be backend-only: callers provide an `assist_satellite.*` entity id through a service or WebSocket command, and the integration logs normalized Transcript Deltas while also serving them through its WebSocket subscription. Config flow, polished card UI, and persistent options wait until this proves passive streaming capture from Home Assistant Assist debug data.

## Consequences

- No hard-coded satellite id in source.
- No YAML setup for the POC.
- No satellite/options config flow until the capture path works. A minimal setup-only config flow may exist so Home Assistant can load the custom integration without YAML.
- Home Assistant Core/Frontend source is cloned into ignored `ha-src/` only when local diffing or execution against fake data becomes useful.
