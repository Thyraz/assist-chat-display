"""Tests for Assist transcript broker wakeup behavior."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
import unittest

from custom_components.assist_chat_display.broker import (
    AssistTranscriptBroker,
    _should_wake_for_state_change,
)


def state(value: str) -> SimpleNamespace:
    """Build a minimal Home Assistant State-like object."""
    return SimpleNamespace(state=value)


def state_event(old_state: str | None, new_state: str | None) -> SimpleNamespace:
    """Build a minimal Home Assistant state-changed event-like object."""
    return SimpleNamespace(
        data={
            "old_state": state(old_state) if old_state is not None else None,
            "new_state": state(new_state) if new_state is not None else None,
        }
    )


class BrokerStateWakeupTest(unittest.TestCase):
    """State-change wakeup decisions."""

    def test_wakes_when_satellite_enters_active_state(self) -> None:
        self.assertTrue(_should_wake_for_state_change(state_event("idle", "listening")))

    def test_wakes_when_satellite_leaves_active_state(self) -> None:
        self.assertTrue(_should_wake_for_state_change(state_event("responding", "idle")))

    def test_does_not_wake_for_inactive_state_change(self) -> None:
        self.assertFalse(_should_wake_for_state_change(state_event("idle", "idle")))


class BrokerWaitWakeupTest(unittest.IsolatedAsyncioTestCase):
    """Polling wakeup behavior."""

    async def test_subscribe_poll_task_does_not_block_startup(self) -> None:
        fake_hass = FakeHass()
        broker = AssistTranscriptBroker(fake_hass)
        snapshot = broker.get_snapshot("assist_satellite.kitchen")

        unsubscribe = broker.subscribe(
            "assist_satellite.kitchen", lambda delta: None, initial_snapshot=snapshot
        )
        self.addAsyncCleanup(broker.async_shutdown)
        self.addCleanup(unsubscribe)

        self.assertEqual(fake_hass.startup_blocking_tasks, [])
        self.assertEqual(len(fake_hass.background_tasks), 1)

    async def test_wakeup_interrupts_idle_wait(self) -> None:
        broker = AssistTranscriptBroker(FakeHass())
        broker._subscribers["assist_satellite.kitchen"] = {"test": lambda delta: None}

        wait_task = asyncio.create_task(
            broker._wait_for_next_poll("assist_satellite.kitchen", 10.0)
        )
        await asyncio.sleep(0)

        broker._wake_poll_task("assist_satellite.kitchen")

        await asyncio.wait_for(wait_task, timeout=0.1)

    async def test_wakeup_is_ignored_without_subscribers(self) -> None:
        broker = AssistTranscriptBroker(FakeHass())

        broker._wake_poll_task("assist_satellite.kitchen")

        self.assertNotIn("assist_satellite.kitchen", broker._poll_wake_events)


class FakeStates:
    """Minimal Home Assistant states collection."""

    def get(self, entity_id: str) -> None:
        """Return no state."""
        return None


class FakeHass:
    """Minimal Home Assistant-like object for broker task creation."""

    def __init__(self) -> None:
        self.data = {}
        self.states = FakeStates()
        self.startup_blocking_tasks = []
        self.background_tasks = []

    def async_create_task(self, coroutine) -> asyncio.Task:
        """Create a startup-blocking task."""
        task = asyncio.create_task(coroutine)
        self.startup_blocking_tasks.append(task)
        return task

    def async_create_background_task(self, coroutine, name: str) -> asyncio.Task:
        """Create a background task."""
        task = asyncio.create_task(coroutine, name=name)
        self.background_tasks.append(task)
        return task


if __name__ == "__main__":
    unittest.main()
