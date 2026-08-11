"""Assist Chat Display integration."""

from __future__ import annotations

from typing import Any

from .broker import AssistTranscriptBroker
from .const import (
    ATTR_ASSIST_SATELLITE_ENTITY,
    DATA_BROKER,
    DOMAIN,
    SERVICE_GET_TRANSCRIPT,
)


async def async_setup(hass: Any, config: dict[str, Any]) -> bool:
    """Set up Assist Chat Display."""
    import voluptuous as vol  # noqa: PLC0415

    from homeassistant.core import SupportsResponse  # noqa: PLC0415
    from homeassistant.exceptions import HomeAssistantError  # noqa: PLC0415

    from .permissions import async_validate_context_can_read_satellite  # noqa: PLC0415
    from .schema import assist_satellite_entity_id  # noqa: PLC0415
    from .frontend import async_register_frontend  # noqa: PLC0415
    from .websocket_api import async_register_websocket_api  # noqa: PLC0415

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][DATA_BROKER] = AssistTranscriptBroker(hass)

    async def handle_get_transcript(call: Any) -> dict[str, Any]:
        assist_satellite_entity = call.data[ATTR_ASSIST_SATELLITE_ENTITY]
        await async_validate_context_can_read_satellite(
            hass, call.context, assist_satellite_entity
        )
        if not (domain_data := hass.data.get(DOMAIN)):
            raise HomeAssistantError("Assist Chat Display is not loaded")
        if (broker := domain_data.get(DATA_BROKER)) is None:
            raise HomeAssistantError("Assist transcript broker is not loaded")
        return broker.get_snapshot(assist_satellite_entity).as_dict()

    if not hass.services.has_service(DOMAIN, SERVICE_GET_TRANSCRIPT):
        hass.services.async_register(
            DOMAIN,
            SERVICE_GET_TRANSCRIPT,
            handle_get_transcript,
            schema=vol.Schema(
                {vol.Required(ATTR_ASSIST_SATELLITE_ENTITY): assist_satellite_entity_id}
            ),
            supports_response=SupportsResponse.ONLY,
        )

    async_register_websocket_api(hass)
    await async_register_frontend(hass)
    return True


async def async_setup_entry(hass: Any, entry: Any) -> bool:
    """Set up a config entry.

    The integration has no stored satellite configuration; callers provide the satellite
    entity through the WebSocket command or response-only action.
    """
    return True


async def async_unload_entry(hass: Any, entry: Any) -> bool:
    """Unload a config entry."""
    if len(hass.config_entries.async_entries(DOMAIN)) > 1:
        return True

    if domain_data := hass.data.get(DOMAIN):
        broker = domain_data.get(DATA_BROKER)
        if broker is not None:
            await broker.async_shutdown()
        hass.data.pop(DOMAIN, None)

    if hass.services.has_service(DOMAIN, SERVICE_GET_TRANSCRIPT):
        hass.services.async_remove(DOMAIN, SERVICE_GET_TRANSCRIPT)

    return True
