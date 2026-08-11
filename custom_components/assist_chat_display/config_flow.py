"""Config flow for Assist Chat Display."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries

from .const import DOMAIN


class AssistChatDisplayConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create a single Assist Chat Display config entry."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title="Assist Chat Display", data={})
