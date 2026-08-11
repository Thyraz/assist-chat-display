# HACS Packaging Notes

Last checked: 2026-08-10.

## Findings

- HACS repositories are categorized, including `Integration` for `custom_components` and `Plugin` for Lovelace cards.
- A HACS integration repository must place integration runtime files under `custom_components/<domain>/`.
- Home Assistant custom cards are JavaScript modules loaded as dashboard resources.
- A custom integration can ship frontend JavaScript inside its own integration directory, serve it through Home Assistant HTTP static paths, and register the dashboard resource automatically in storage-mode dashboards.
- Use `hass.http.async_register_static_paths` with `StaticPathConfig`; the older sync `register_static_path` API is deprecated/removed and must not be used.

## Implication For This Project

Package the backend and card as a single HACS **Integration** repository. The card JavaScript should live inside the integration, not as a separate HACS Plugin install. The integration serves and registers the card resource.

This keeps backend and frontend versions synchronized and avoids asking users to install two HACS entries.
