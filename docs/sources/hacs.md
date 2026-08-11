# HACS Packaging Notes

Last checked: 2026-08-12.

## Findings

- HACS repositories are categorized, including `Integration` for `custom_components` and `Plugin` for Lovelace cards.
- A HACS integration repository must place integration runtime files under `custom_components/<domain>/`.
- A HACS integration repository must include one integration only. All files required at runtime must live under that integration directory.
- HACS integration manifests are expected to include `domain`, `documentation`, `issue_tracker`, `codeowners`, `name`, and `version`.
- When a repository uses GitHub releases, HACS uses the latest release tag as the remote version. A tag alone is not enough; a GitHub Release must be published.
- `hacs.json` can set `hide_default_branch: true` so users only install released versions, not the repository default branch.
- Home Assistant custom cards are JavaScript modules loaded as dashboard resources.
- HACS Dashboard repositories store cards under `www/community/` and serve them through `/hacsfiles/`, where HACS adds no-cache behavior and can serve `.gz` files.
- A custom integration can ship frontend JavaScript inside its own integration directory, serve it through Home Assistant HTTP static paths, and register the dashboard resource automatically in storage-mode dashboards.
- Use `hass.http.async_register_static_paths` with `StaticPathConfig`; the older sync `register_static_path` API is deprecated/removed and must not be used.

## Implication For This Project

Package the backend and card as a single HACS **Integration** repository. The card JavaScript should live inside the integration, not as a separate HACS Plugin install. The integration serves and registers the card resource.

This keeps backend and frontend versions synchronized and avoids asking users to install two HACS entries.

Because this project is packaged as a HACS Integration, its card is not served through HACS' `/hacsfiles/` dashboard endpoint. Keep the version query on the registered card resource URL:

```text
/assist_chat_display/assist-chat-display-card.js?v=<manifest version>
```

For manual releases, keep these versions aligned:

- `custom_components/assist_chat_display/manifest.json` `version`
- the generated Lovelace resource query parameter
- the GitHub Release tag

Use a real GitHub Release for each distributed version. Do not rely on bare tags.

When the public repository URL is known, add repository-specific values to the integration manifest:

- `documentation`
- `issue_tracker`
- `codeowners`
