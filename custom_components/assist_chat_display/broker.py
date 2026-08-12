"""Assist transcript broker for live/recent transcript consumers."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
from typing import TYPE_CHECKING
from uuid import uuid4

from .const import (
    ACTIVE_POLL_INTERVAL,
    ACTIVE_SATELLITE_STATES,
    DOMAIN,
    IDLE_POLL_INTERVAL,
)
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
        self._poll_wake_events: dict[str, asyncio.Event] = {}
        self._state_unsubscribers: dict[str, CALLBACK_TYPE] = {}
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
        self._ensure_state_listener(assist_satellite_entity)

        def unsubscribe() -> None:
            satellite_subscribers = self._subscribers.get(assist_satellite_entity)
            if not satellite_subscribers:
                return
            satellite_subscribers.pop(token, None)
            if satellite_subscribers:
                return

            self._subscribers.pop(assist_satellite_entity, None)
            self._last_snapshots.pop(assist_satellite_entity, None)
            self._poll_wake_events.pop(assist_satellite_entity, None)
            if unsubscribe_state := self._state_unsubscribers.pop(
                assist_satellite_entity, None
            ):
                unsubscribe_state()
            if task := self._poll_tasks.pop(assist_satellite_entity, None):
                task.cancel()

        return unsubscribe

    async def async_shutdown(self) -> None:
        """Stop all active poll tasks."""
        tasks = list(self._poll_tasks.values())
        state_unsubscribers = list(self._state_unsubscribers.values())
        self._poll_tasks.clear()
        self._subscribers.clear()
        self._poll_wake_events.clear()
        self._state_unsubscribers.clear()
        self._last_snapshots.clear()

        for unsubscribe_state in state_unsubscribers:
            unsubscribe_state()

        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    def _ensure_poll_task(self, assist_satellite_entity: str) -> None:
        task = self._poll_tasks.get(assist_satellite_entity)
        if task is not None and not task.done():
            return
        self._poll_tasks[assist_satellite_entity] = (
            self.hass.async_create_background_task(
                self._poll_satellite(assist_satellite_entity),
                f"{DOMAIN} poll {assist_satellite_entity}",
            )
        )

    def _ensure_state_listener(self, assist_satellite_entity: str) -> None:
        """Wake polling immediately when the watched satellite changes state."""
        if assist_satellite_entity in self._state_unsubscribers:
            return

        try:
            from homeassistant.core import callback  # noqa: PLC0415
            from homeassistant.helpers.event import (  # noqa: PLC0415
                async_track_state_change_event,
            )
        except ImportError:
            _LOGGER.debug(
                "Home Assistant state change helper is unavailable; "
                "falling back to timer-only polling for %s",
                assist_satellite_entity,
            )
            return

        @callback
        def _async_state_changed(event: object) -> None:
            if not _should_wake_for_state_change(event):
                return

            _LOGGER.debug(
                "Waking Assist transcript polling for %s after satellite state change",
                assist_satellite_entity,
            )
            self._wake_poll_task(assist_satellite_entity)

        self._state_unsubscribers[assist_satellite_entity] = (
            async_track_state_change_event(
                self.hass, assist_satellite_entity, _async_state_changed
            )
        )

    def _wake_poll_task(self, assist_satellite_entity: str) -> None:
        """Wake a poll task before its next timer interval."""
        if not self._subscribers.get(assist_satellite_entity):
            return

        wake_event = self._poll_wake_events.setdefault(
            assist_satellite_entity, asyncio.Event()
        )
        wake_event.set()

    async def _poll_satellite(self, assist_satellite_entity: str) -> None:
        try:
            while self._subscribers.get(assist_satellite_entity):
                current = self.get_snapshot(assist_satellite_entity)
                previous = self._last_snapshots.get(assist_satellite_entity)
                self._last_snapshots[assist_satellite_entity] = current

                deltas = diff_snapshots(previous, current)
                if deltas:
                    self._publish(assist_satellite_entity, deltas)

                await self._wait_for_next_poll(
                    assist_satellite_entity,
                    self._poll_interval(assist_satellite_entity, current)
                )
        except asyncio.CancelledError:
            raise
        finally:
            self._poll_tasks.pop(assist_satellite_entity, None)

    async def _wait_for_next_poll(
        self, assist_satellite_entity: str, interval: float
    ) -> None:
        """Wait for the next timer poll or a state-change wakeup."""
        wake_event = self._poll_wake_events.setdefault(
            assist_satellite_entity, asyncio.Event()
        )
        try:
            await asyncio.wait_for(wake_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            return

        wake_event.clear()

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


def _should_wake_for_state_change(event: object) -> bool:
    """Return if a satellite state change should wake transcript polling."""
    old_state = _state_value(_event_state(event, "old_state"))
    new_state = _state_value(_event_state(event, "new_state"))

    return (
        old_state in ACTIVE_SATELLITE_STATES
        or new_state in ACTIVE_SATELLITE_STATES
    )


def _event_state(event: object, key: str) -> object | None:
    """Return one state object from a Home Assistant state-changed event."""
    data = getattr(event, "data", None)
    if not isinstance(data, dict):
        return None
    return data.get(key)


def _state_value(state: object | None) -> str | None:
    """Return a normalized Home Assistant state value."""
    if state is None:
        return None

    value = getattr(state, "state", None)
    if value is None:
        return None

    return str(value).lower()
