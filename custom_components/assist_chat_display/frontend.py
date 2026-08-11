"""Frontend resource registration for Assist Chat Display."""

from __future__ import annotations

from pathlib import Path
import logging
from typing import Any

from .const import (
    CARD_FILENAME,
    CARD_RESOURCE_TYPE,
    CARD_STATIC_URL_PATH,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


async def async_register_frontend(hass: Any) -> None:
    """Serve and register the bundled dashboard card."""
    from homeassistant.components.http import StaticPathConfig  # noqa: PLC0415
    from homeassistant.loader import async_get_integration  # noqa: PLC0415

    www_path = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_STATIC_URL_PATH, str(www_path), True)]
    )

    try:
        integration = await async_get_integration(hass, DOMAIN)
        version = str(
            getattr(integration, "version", None)
            or integration.manifest.get("version", "0")
        )
    except Exception:  # pragma: no cover - defensive against loader internals.
        _LOGGER.debug("Could not read integration version for card resource URL")
        version = "0"

    await _async_register_lovelace_resource(
        hass, f"{CARD_STATIC_URL_PATH}/{CARD_FILENAME}?v={version}"
    )


async def _async_register_lovelace_resource(hass: Any, resource_url: str) -> None:
    """Register the card resource in Lovelace storage mode."""
    try:
        from homeassistant.components.lovelace.const import (  # noqa: PLC0415
            CONF_RESOURCE_TYPE_WS,
            LOVELACE_DATA,
            MODE_STORAGE,
        )
        from homeassistant.const import CONF_ID, CONF_TYPE, CONF_URL  # noqa: PLC0415
    except ImportError:
        _LOGGER.debug("Lovelace is unavailable; skipping card resource registration")
        return

    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        _LOGGER.debug(
            "Lovelace data is unavailable; skipping card resource registration"
        )
        return

    if lovelace_data.resource_mode != MODE_STORAGE:
        _LOGGER.debug(
            "Lovelace resources are in %s mode; document manual YAML resource setup",
            lovelace_data.resource_mode,
        )
        return

    resources = lovelace_data.resources
    await resources.async_get_info()
    existing_items = list(resources.async_items())
    current_resource = next(
        (item for item in existing_items if item.get(CONF_URL) == resource_url), None
    )

    if current_resource is not None:
        if current_resource.get(CONF_TYPE) != CARD_RESOURCE_TYPE:
            await resources.async_update_item(
                current_resource[CONF_ID],
                {CONF_RESOURCE_TYPE_WS: CARD_RESOURCE_TYPE},
            )
        return

    matching_resource = next(
        (
            item
            for item in existing_items
            if _is_assist_chat_display_card_resource(item.get(CONF_URL))
        ),
        None,
    )

    if matching_resource is not None:
        await resources.async_update_item(
            matching_resource[CONF_ID],
            {CONF_RESOURCE_TYPE_WS: CARD_RESOURCE_TYPE, CONF_URL: resource_url},
        )
        return

    await resources.async_create_item(
        {CONF_RESOURCE_TYPE_WS: CARD_RESOURCE_TYPE, CONF_URL: resource_url}
    )


def _is_assist_chat_display_card_resource(url: object) -> bool:
    """Return if a Lovelace resource URL points at this card."""
    if not isinstance(url, str):
        return False

    return url.split("?", 1)[0] == f"{CARD_STATIC_URL_PATH}/{CARD_FILENAME}"
