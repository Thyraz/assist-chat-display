# Package the card inside the HACS integration

This project ships as a single HACS Integration repository that includes the Assist Transcript Broker and the dashboard card. The integration serves the card JavaScript from its own files and registers it as a dashboard resource so backend and frontend versions cannot drift apart; a separate HACS Plugin install is deliberately avoided.

## Consequences

- The card must live under `custom_components/<domain>/` with the integration runtime.
- The integration must serve frontend assets with `hass.http.async_register_static_paths` and `StaticPathConfig`; deprecated `register_static_path` must not be used.
- Storage-mode dashboards can have the card resource registered automatically. YAML-mode users may still need documented manual resource configuration.
