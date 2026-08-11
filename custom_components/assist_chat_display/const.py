"""Constants for Assist Chat Display."""

from __future__ import annotations

DOMAIN = "assist_chat_display"
DATA_BROKER = "broker"

ATTR_ASSIST_SATELLITE_ENTITY = "assist_satellite_entity"

SERVICE_GET_TRANSCRIPT = "get_transcript"

WS_TYPE_SUBSCRIBE = f"{DOMAIN}/subscribe"

SOURCE_ASSIST_DEBUG_CACHE = "assist_debug_cache"

CARD_ELEMENT_NAME = "assist-chat-display-card"
CARD_FILENAME = f"{CARD_ELEMENT_NAME}.js"
CARD_STATIC_URL_PATH = f"/{DOMAIN}"
CARD_RESOURCE_TYPE = "module"

ACTIVE_SATELLITE_STATES = frozenset({"listening", "processing", "responding"})
ACTIVE_POLL_INTERVAL = 0.15
IDLE_POLL_INTERVAL = 2.0
