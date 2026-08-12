"""Normalize Home Assistant Assist debug events into transcript data."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal

from .const import SOURCE_ASSIST_DEBUG_CACHE

JsonDict = dict[str, Any]
MessageRole = Literal["user", "assistant"]
MessageStatus = Literal["placeholder", "streaming", "final", "error"]
DeltaType = Literal["message_add", "message_update", "message_replace"]


@dataclass(frozen=True, slots=True)
class DebugRun:
    """A Home Assistant Assist debug run."""

    pipeline_id: str
    run_id: str
    timestamp: str
    events: list[Any]


@dataclass(frozen=True, slots=True)
class TranscriptMessage:
    """A normalized displayed transcript message."""

    id: str
    run_id: str
    role: MessageRole
    text: str
    status: MessageStatus
    created_at: str
    updated_at: str
    details: JsonDict = field(default_factory=dict)

    def as_dict(self) -> JsonDict:
        """Return a JSON-serializable representation."""
        data: JsonDict = {
            "id": self.id,
            "run_id": self.run_id,
            "role": self.role,
            "text": self.text,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if self.details:
            data["details"] = self.details
        return data


@dataclass(frozen=True, slots=True)
class TranscriptDelta:
    """A normalized update for a transcript consumer."""

    type: DeltaType
    message: TranscriptMessage

    def as_dict(self) -> JsonDict:
        """Return a JSON-serializable representation."""
        return {"type": self.type, "message": self.message.as_dict()}


@dataclass(frozen=True, slots=True)
class TranscriptSnapshot:
    """A best-effort transcript snapshot from current Assist debug data."""

    assist_satellite_entity: str
    generated_at: str
    messages: list[TranscriptMessage]
    source: str = SOURCE_ASSIST_DEBUG_CACHE
    unattributed_runs: int = 0

    def as_dict(self) -> JsonDict:
        """Return a JSON-serializable representation."""
        return {
            "assist_satellite_entity": self.assist_satellite_entity,
            "generated_at": self.generated_at,
            "source": self.source,
            "messages": [message.as_dict() for message in self.messages],
        }


@dataclass(slots=True)
class _RunResult:
    """Internal result for one run normalization."""

    messages: list[TranscriptMessage]
    satellite_id: str | None


def build_snapshot(
    runs: list[DebugRun],
    assist_satellite_entity: str,
    *,
    generated_at: str | None = None,
) -> TranscriptSnapshot:
    """Build a transcript snapshot for one Assist Satellite."""
    messages: list[TranscriptMessage] = []
    unattributed_runs = 0

    for run in sorted(runs, key=lambda item: item.timestamp):
        result = normalize_run(run)
        if result.satellite_id is None:
            unattributed_runs += 1
            continue
        if result.satellite_id != assist_satellite_entity:
            continue
        messages.extend(result.messages)

    return TranscriptSnapshot(
        assist_satellite_entity=assist_satellite_entity,
        generated_at=generated_at or utc_now_iso(),
        messages=messages,
        unattributed_runs=unattributed_runs,
    )


def diff_snapshots(
    previous: TranscriptSnapshot | None, current: TranscriptSnapshot
) -> list[TranscriptDelta]:
    """Return add/update/replace deltas from previous to current snapshot.

    Removed messages are intentionally ignored. The browser owns its observed
    session cache and should not lose messages just because Home Assistant
    evicted older debug runs.
    """
    if previous is None:
        return []

    previous_by_id = {message.id: message for message in previous.messages}
    deltas: list[TranscriptDelta] = []

    for message in current.messages:
        old = previous_by_id.get(message.id)
        if old is None:
            deltas.append(TranscriptDelta("message_add", message))
            continue

        if old.as_dict() == message.as_dict():
            continue

        delta_type: DeltaType = "message_update"
        if old.status in {"placeholder", "streaming"} and message.status in {
            "final",
            "error",
        }:
            delta_type = "message_replace"
        deltas.append(TranscriptDelta(delta_type, message))

    return deltas


def normalize_run(run: DebugRun) -> _RunResult:
    """Normalize one Assist debug run."""
    satellite_id = _satellite_id_from_run(run.events)
    if satellite_id is None:
        return _RunResult(messages=[], satellite_id=None)

    run_started_at = _first_timestamp(run.events, fallback=run.timestamp)
    run_ended = False

    user_created_at = run_started_at
    user_updated_at = run_started_at
    user_text = ""
    user_status: MessageStatus | None = None

    assistant_created_at: str | None = None
    assistant_updated_at: str | None = None
    assistant_text = ""
    assistant_status: MessageStatus | None = None
    thinking_parts: list[str] = []
    tool_calls: dict[str, JsonDict] = {}
    tool_results: list[JsonDict] = []
    tts_start_streaming = False
    error_detail: JsonDict | None = None
    current_chat_role: str | None = None

    for event in run.events:
        event_type = _event_type(event)
        event_data = _event_data(event)
        timestamp = _event_timestamp(event, fallback=run.timestamp)

        if event_type in {"run-start", "stt-start"}:
            if user_status is None:
                user_status = "placeholder"
                user_created_at = timestamp
                user_updated_at = timestamp
            continue

        if event_type == "stt-end":
            text = _dig(event_data, "stt_output", "text")
            if isinstance(text, str) and text:
                user_text = text
                user_status = "final"
                user_updated_at = timestamp
            continue

        if event_type == "intent-start":
            text = event_data.get("intent_input")
            if isinstance(text, str) and text and not user_text:
                user_text = text
                user_status = "final"
                user_updated_at = timestamp
            continue

        if event_type == "intent-progress":
            if event_data.get("tts_start_streaming") is True:
                tts_start_streaming = True

            delta = event_data.get("chat_log_delta")
            if not isinstance(delta, dict):
                continue

            if role := delta.get("role"):
                current_chat_role = str(role)

            if _is_assistant_delta(delta, current_chat_role):
                if assistant_created_at is None:
                    assistant_created_at = timestamp
                assistant_updated_at = timestamp
                assistant_status = "streaming"

                content = delta.get("content")
                if isinstance(content, str):
                    assistant_text += content

                thinking_content = delta.get("thinking_content")
                if isinstance(thinking_content, str):
                    thinking_parts.append(thinking_content)

                for tool_call in _iter_dicts(delta.get("tool_calls")):
                    tool_id = str(tool_call.get("id") or len(tool_calls))
                    tool_calls[tool_id] = dict(tool_call)

                continue

            if delta.get("role") == "tool_result":
                assistant_updated_at = timestamp
                tool_results.append(dict(delta))
            continue

        if event_type == "intent-end":
            intent_output = event_data.get("intent_output")
            response_text = _dig(
                intent_output, "response", "speech", "plain", "speech"
            )
            response_type = _dig(intent_output, "response", "response_type")
            if isinstance(response_text, str):
                if assistant_created_at is None:
                    assistant_created_at = timestamp
                assistant_updated_at = timestamp
                assistant_text = response_text
                assistant_status = "error" if response_type == "error" else "final"
            continue

        if event_type == "error":
            if assistant_created_at is None:
                assistant_created_at = timestamp
            assistant_updated_at = timestamp
            assistant_text = "Assist failed to respond."
            assistant_status = "error"
            error_detail = {
                "code": str(event_data.get("code") or "error"),
                "message": str(event_data.get("message") or ""),
            }
            continue

        if event_type == "run-end":
            run_ended = True

    messages: list[TranscriptMessage] = []
    if user_status is not None and (user_text or not run_ended):
        messages.append(
            TranscriptMessage(
                id=f"{run.run_id}:user",
                run_id=run.run_id,
                role="user",
                text=user_text,
                status=user_status,
                created_at=user_created_at,
                updated_at=user_updated_at,
            )
        )

    if assistant_status is not None and (
        assistant_text or thinking_parts or tool_calls or tool_results or error_detail
    ):
        details: JsonDict = {}
        if thinking_parts:
            details["thinking_content"] = "".join(thinking_parts)
        if tool_calls:
            details["tool_calls"] = list(tool_calls.values())
        if tool_results:
            details["tool_results"] = tool_results
        if tts_start_streaming:
            details["tts_start_streaming"] = True
        if error_detail:
            details["error"] = error_detail

        created_at = assistant_created_at or run_started_at
        messages.append(
            TranscriptMessage(
                id=f"{run.run_id}:assistant",
                run_id=run.run_id,
                role="assistant",
                text=assistant_text,
                status=assistant_status,
                created_at=created_at,
                updated_at=assistant_updated_at or created_at,
                details=details,
            )
        )

    return _RunResult(messages=messages, satellite_id=satellite_id)


def utc_now_iso() -> str:
    """Return the current UTC timestamp in Home Assistant-style ISO format."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _satellite_id_from_run(events: list[Any]) -> str | None:
    for event in events:
        if _event_type(event) != "run-start":
            continue
        satellite_id = _event_data(event).get("satellite_id")
        return satellite_id if isinstance(satellite_id, str) else None
    return None


def _first_timestamp(events: list[Any], *, fallback: str) -> str:
    for event in events:
        return _event_timestamp(event, fallback=fallback)
    return fallback


def _event_type(event: Any) -> str:
    raw_type = _read(event, "type")
    if isinstance(raw_type, Enum):
        return str(raw_type.value)
    return str(raw_type)


def _event_data(event: Any) -> JsonDict:
    data = _read(event, "data")
    return data if isinstance(data, dict) else {}


def _event_timestamp(event: Any, *, fallback: str) -> str:
    timestamp = _read(event, "timestamp")
    return timestamp if isinstance(timestamp, str) else fallback


def _read(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def _dig(value: Any, *path: str) -> Any:
    current = value
    for key in path:
        if isinstance(current, dict):
            current = current.get(key)
        else:
            current = getattr(current, key, None)
        if current is None:
            return None
    return current


def _is_assistant_delta(delta: JsonDict, current_role: str | None) -> bool:
    if current_role == "assistant":
        return True
    return any(key in delta for key in ("content", "thinking_content", "tool_calls"))


def _iter_dicts(value: Any) -> list[JsonDict]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
