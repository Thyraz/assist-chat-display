"""Tests for Assist transcript normalization."""

from __future__ import annotations

import unittest

from custom_components.assist_chat_display.transcript import (
    DebugRun,
    build_snapshot,
    diff_snapshots,
)


def event(event_type: str, data: dict | None = None, timestamp: str | None = None) -> dict:
    """Build a lightweight pipeline event."""
    return {
        "type": event_type,
        "data": data or {},
        "timestamp": timestamp or "2026-08-11T10:00:00Z",
    }


def run(run_id: str, events: list[dict], timestamp: str = "2026-08-11T10:00:00Z") -> DebugRun:
    """Build a lightweight debug run."""
    return DebugRun(
        pipeline_id="preferred",
        run_id=run_id,
        timestamp=timestamp,
        events=events,
    )


class TranscriptNormalizationTest(unittest.TestCase):
    """Transcript normalization behavior."""

    def test_streaming_assistant_message_is_replaced_by_final_response(self) -> None:
        partial = build_snapshot(
            [
                run(
                    "run_1",
                    [
                        event("run-start", {"satellite_id": "assist_satellite.kitchen"}),
                        event("stt-end", {"stt_output": {"text": "Is the garage closed?"}}),
                        event("intent-progress", {"chat_log_delta": {"role": "assistant"}}),
                        event("intent-progress", {"chat_log_delta": {"content": "Let me "}}),
                        event("intent-progress", {"chat_log_delta": {"content": "check"}}),
                    ],
                )
            ],
            "assist_satellite.kitchen",
            generated_at="2026-08-11T10:00:05Z",
        )

        final = build_snapshot(
            [
                run(
                    "run_1",
                    [
                        event("run-start", {"satellite_id": "assist_satellite.kitchen"}),
                        event("stt-end", {"stt_output": {"text": "Is the garage closed?"}}),
                        event("intent-progress", {"chat_log_delta": {"role": "assistant"}}),
                        event("intent-progress", {"chat_log_delta": {"content": "Let me "}}),
                        event("intent-progress", {"chat_log_delta": {"content": "check"}}),
                        event(
                            "intent-end",
                            {
                                "intent_output": {
                                    "response": {
                                        "response_type": "action_done",
                                        "speech": {
                                            "plain": {
                                                "speech": "The garage door is closed."
                                            }
                                        },
                                    },
                                    "conversation_id": "conv_1",
                                }
                            },
                        ),
                    ],
                )
            ],
            "assist_satellite.kitchen",
            generated_at="2026-08-11T10:00:06Z",
        )

        self.assertEqual(
            [message.as_dict() for message in partial.messages],
            [
                {
                    "id": "run_1:user",
                    "run_id": "run_1",
                    "role": "user",
                    "text": "Is the garage closed?",
                    "status": "final",
                    "created_at": "2026-08-11T10:00:00Z",
                    "updated_at": "2026-08-11T10:00:00Z",
                },
                {
                    "id": "run_1:assistant",
                    "run_id": "run_1",
                    "role": "assistant",
                    "text": "Let me check",
                    "status": "streaming",
                    "created_at": "2026-08-11T10:00:00Z",
                    "updated_at": "2026-08-11T10:00:00Z",
                },
            ],
        )

        deltas = diff_snapshots(partial, final)
        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0].type, "message_replace")
        self.assertEqual(deltas[0].message.id, "run_1:assistant")
        self.assertEqual(deltas[0].message.text, "The garage door is closed.")
        self.assertEqual(deltas[0].message.status, "final")

    def test_filters_by_satellite_and_counts_unattributed_runs(self) -> None:
        snapshot = build_snapshot(
            [
                run(
                    "run_kitchen",
                    [
                        event("run-start", {"satellite_id": "assist_satellite.kitchen"}),
                        event("intent-start", {"intent_input": "Kitchen question"}),
                    ],
                ),
                run(
                    "run_office",
                    [
                        event("run-start", {"satellite_id": "assist_satellite.office"}),
                        event("intent-start", {"intent_input": "Office question"}),
                    ],
                ),
                run(
                    "run_unknown",
                    [
                        event("run-start", {}),
                        event("intent-start", {"intent_input": "Unknown question"}),
                    ],
                ),
            ],
            "assist_satellite.kitchen",
            generated_at="2026-08-11T10:00:00Z",
        )

        self.assertEqual(snapshot.unattributed_runs, 1)
        self.assertEqual([message.id for message in snapshot.messages], ["run_kitchen:user"])
        self.assertEqual(snapshot.messages[0].text, "Kitchen question")

    def test_stt_start_creates_listening_placeholder(self) -> None:
        snapshot = build_snapshot(
            [
                run(
                    "run_1",
                    [
                        event("run-start", {"satellite_id": "assist_satellite.kitchen"}),
                        event("stt-start"),
                    ],
                )
            ],
            "assist_satellite.kitchen",
            generated_at="2026-08-11T10:00:00Z",
        )

        self.assertEqual(len(snapshot.messages), 1)
        self.assertEqual(snapshot.messages[0].role, "user")
        self.assertEqual(snapshot.messages[0].text, "")
        self.assertEqual(snapshot.messages[0].status, "placeholder")

    def test_error_event_creates_assistant_error_bubble(self) -> None:
        snapshot = build_snapshot(
            [
                run(
                    "run_1",
                    [
                        event("run-start", {"satellite_id": "assist_satellite.kitchen"}),
                        event("stt-end", {"stt_output": {"text": "Turn on the lights"}}),
                        event(
                            "error",
                            {"code": "intent-failed", "message": "Unexpected error"},
                        ),
                    ],
                )
            ],
            "assist_satellite.kitchen",
            generated_at="2026-08-11T10:00:00Z",
        )

        self.assertEqual(len(snapshot.messages), 2)
        self.assertEqual(snapshot.messages[1].role, "assistant")
        self.assertEqual(snapshot.messages[1].status, "error")
        self.assertEqual(snapshot.messages[1].text, "Assist failed to respond.")
        self.assertEqual(
            snapshot.messages[1].details["error"],
            {"code": "intent-failed", "message": "Unexpected error"},
        )


if __name__ == "__main__":
    unittest.main()
