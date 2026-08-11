"""Validation schemas for Assist Chat Display."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.helpers import config_validation as cv


def assist_satellite_entity_id(value: object) -> str:
    """Validate an Assist Satellite entity id."""
    entity_id = cv.entity_id(value)
    if not entity_id.startswith("assist_satellite."):
        raise vol.Invalid("Expected an assist_satellite entity")
    return entity_id
