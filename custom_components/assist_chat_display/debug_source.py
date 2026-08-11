"""Read Home Assistant Assist debug runs from in-memory state."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .transcript import DebugRun

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant


def list_debug_runs(hass: HomeAssistant) -> list[DebugRun]:
    """Return all current Assist pipeline debug runs.

    Home Assistant currently stores these under
    hass.data[KEY_ASSIST_PIPELINE].pipeline_debug. This is intentionally kept in
    one adapter module because it is not a stable public capture API.
    """
    try:
        from homeassistant.components.assist_pipeline.pipeline import (  # noqa: PLC0415
            KEY_ASSIST_PIPELINE,
        )
    except ImportError:
        return []

    pipeline_data = hass.data.get(KEY_ASSIST_PIPELINE)
    pipeline_debug = getattr(pipeline_data, "pipeline_debug", None)
    if not pipeline_debug:
        return []

    runs: list[DebugRun] = []
    for pipeline_id, debug_by_run_id in pipeline_debug.items():
        for run_id, run_debug in debug_by_run_id.items():
            runs.append(
                DebugRun(
                    pipeline_id=str(pipeline_id),
                    run_id=str(run_id),
                    timestamp=str(getattr(run_debug, "timestamp", "")),
                    events=list(getattr(run_debug, "events", [])),
                )
            )
    return runs
