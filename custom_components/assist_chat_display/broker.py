"""Assist transcript broker for live/recent transcript consumers."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
from typing import TYPE_CHECKING
from uuid import uuid4

from .const import ACTIVE_POLL_INTERVAL, ACTIVE_SATELLITE_STATES, IDLE_POLL_INTERVAL
from .debug_source import list_debug_runs
from .transcript import (
    TranscriptDelta,
    TranscriptSnapshot,
    build_snapshot,
    diff_snapshots,
)

if TYPE_CHECKING:
    from homeassistant.core import CALLBACK_TYPE, HomeAssistant

_LOGGER = logging.getLogger(__name__)

Subscriber = Callable[[TranscriptDelta], None]


class AssistTranscriptBroker:
    """Normalize Assist debug data and stream transcript deltas."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the broker."""
        self.hass = hass
        self._subscribers: dict[str, dict[str, Subscriber]] = {}
        self._poll_tasks: dict[str, asyncio.Task[None]] = {}
        self._last_snapshots: dict[str, TranscriptSnapshot] = {}

    def get_snapshot(self, assist_satellite_entity: str) -> TranscriptSnapshot:
        """Return a recent snapshot for one Assist Satellite."""
        snapshot = build_snapshot(
            list_debug_runs(self.hass),
            assist_satellite_entity,
        )
        if snapshot.unattributed_runs:
            _LOGGER.debug(
                "Ignored %s unattributed Assist debug runs while reading %s",
                snapshot.unattributed_runs,
                assist_satellite_entity,
            )
        return snapshot

    def subscribe(
        self,
        assist_satellite_entity: str,
        callback: Subscriber,
        *,
        initial_snapshot: TranscriptSnapshot | None = None,
    ) -> CALLBACK_TYPE:
        """Subscribe to transcript deltas for one Assist Satellite."""
        token = uuid4().hex
        subscribers = self._subscribers.setdefault(assist_satellite_entity, {})
        subscribers[token] = callback

        if (
            initial_snapshot is not None
            and assist_satellite_entity not in self._last_snapshots
        ):
            self._last_snapshots[assist_satellite_entity] = initial_snapshot

        self._ensure_poll_task(assist_satellite_entity)

        def unsubscribe() -> None:
            satellite_subscribers = self._subscribers.get(assist_satellite_entity)
            if not satellite_subscribers:
                return
            satellite_subscribers.pop(token, None)
            if satellite_subscribers:
                return

            self._subscribers.pop(assist_satellite_entity, None)
            self._last_snapshots.pop(assist_satellite_entity, None)
            if task := self._poll_tasks.pop(assist_satellite_entity, None):
                task.cancel()

        return unsubscribe

    async def async_shutdown(self) -> None:
        """Stop all active poll tasks."""
        tasks = list(self._poll_tasks.values())
        self._poll_tasks.clear()
        self._subscribers.clear()
        self._last_snapshots.clear()

        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    def _ensure_poll_task(self, assist_satellite_entity: str) -> None:
        task = self._poll_tasks.get(assist_satellite_entity)
        if task is not None and not task.done():
            return
        self._poll_tasks[assist_satellite_entity] = self.hass.async_create_task(
            self._poll_satellite(assist_satellite_entity)
        )

    async def _poll_satellite(self, assist_satellite_entity: str) -> None:
        try:
            while self._subscribers.get(assist_satellite_entity):
                current = self.get_snapshot(assist_satellite_entity)
                previous = self._last_snapshots.get(assist_satellite_entity)
                self._last_snapshots[assist_satellite_entity] = current

                deltas = diff_snapshots(previous, current)
                if deltas:
                    self._publish(assist_satellite_entity, deltas)

                await asyncio.sleep(
                    self._poll_interval(assist_satellite_entity, current)
                )
        except asyncio.CancelledError:
            raise
        finally:
            self._poll_tasks.pop(assist_satellite_entity, None)

    def _publish(
        self, assist_satellite_entity: str, deltas: list[TranscriptDelta]
    ) -> None:
        subscribers = list(self._subscribers.get(assist_satellite_entity, {}).values())
        for delta in deltas:
            _LOGGER.debug(
                "Assist transcript delta for %s: %s",
                assist_satellite_entity,
                delta.as_dict(),
            )
            for subscriber in subscribers:
                subscriber(delta)

    def _poll_interval(
        self, assist_satellite_entity: str, snapshot: TranscriptSnapshot
    ) -> float:
        state = self.hass.states.get(assist_satellite_entity)
        if state is not None and str(state.state).lower() in ACTIVE_SATELLITE_STATES:
            return ACTIVE_POLL_INTERVAL

        if any(
            message.status in {"placeholder", "streaming"}
            for message in snapshot.messages
        ):
            return ACTIVE_POLL_INTERVAL

        return IDLE_POLL_INTERVAL
