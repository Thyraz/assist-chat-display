"""Permission helpers for Assist Chat Display."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.exceptions import Unauthorized, UnknownUser

if TYPE_CHECKING:
    from homeassistant.auth.models import User
    from homeassistant.core import Context, HomeAssistant


def validate_user_can_read_satellite(user: User, entity_id: str) -> None:
    """Raise if a WebSocket user cannot read the selected satellite."""
    if user.is_admin:
        return
    if user.permissions.check_entity(entity_id, POLICY_READ):
        return
    raise Unauthorized(user_id=user.id, entity_id=entity_id, permission=POLICY_READ)


async def async_validate_context_can_read_satellite(
    hass: HomeAssistant, context: Context, entity_id: str
) -> None:
    """Raise if a service-call context cannot read the selected satellite."""
    if not context.user_id:
        return

    user = await hass.auth.async_get_user(context.user_id)
    if user is None:
        raise UnknownUser(
            context=context,
            entity_id=entity_id,
            permission=POLICY_READ,
        )

    if user.is_admin or user.permissions.check_entity(entity_id, POLICY_READ):
        return

    raise Unauthorized(
        context=context,
        user_id=user.id,
        entity_id=entity_id,
        permission=POLICY_READ,
    )
