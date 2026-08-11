"""WebSocket API for Assist Chat Display."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized

from .broker import AssistTranscriptBroker
from .const import ATTR_ASSIST_SATELLITE_ENTITY, DATA_BROKER, DOMAIN, WS_TYPE_SUBSCRIBE
from .permissions import validate_user_can_read_satellite
from .schema import assist_satellite_entity_id


@callback
def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register WebSocket commands."""
    websocket_api.async_register_command(hass, websocket_subscribe)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_SUBSCRIBE,
        vol.Required(ATTR_ASSIST_SATELLITE_ENTITY): assist_satellite_entity_id,
    }
)
@websocket_api.async_response
async def websocket_subscribe(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Subscribe to normalized transcript deltas for one Assist Satellite."""
    assist_satellite_entity = msg[ATTR_ASSIST_SATELLITE_ENTITY]

    try:
        validate_user_can_read_satellite(connection.user, assist_satellite_entity)
    except Unauthorized as err:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_UNAUTHORIZED,
            str(err) or "Not authorized to read selected Assist Satellite",
        )
        return

    domain_data = hass.data.get(DOMAIN)
    if not domain_data or DATA_BROKER not in domain_data:
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_SUPPORTED,
            "Assist Chat Display is not loaded",
        )
        return

    broker: AssistTranscriptBroker = domain_data[DATA_BROKER]
    snapshot = broker.get_snapshot(assist_satellite_entity)
    connection.send_result(msg["id"], snapshot.as_dict())

    unsubscribe = broker.subscribe(
        assist_satellite_entity,
        lambda delta: connection.send_event(msg["id"], delta.as_dict()),
        initial_snapshot=snapshot,
    )
    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_event(
        msg["id"], {"type": "snapshot", "snapshot": snapshot.as_dict()}
    )
