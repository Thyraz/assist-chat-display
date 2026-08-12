import assert from "node:assert/strict";

import {
  applyTranscriptEvent,
  hydrateFromSnapshot,
  isNearBottom,
  isSnapshotFresh,
  normalizeConfig,
  remainingViewportHeight,
  upsertMessages,
} from "../../custom_components/assist_chat_display/www/assist-chat-display-card.js";

const now = Date.parse("2026-08-11T20:00:00.000Z");

function message(id, role, text, status, updatedAt = "2026-08-11T19:59:00.000Z") {
  return {
    id,
    run_id: id.split(":")[0],
    role,
    text,
    status,
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

function snapshot(generatedAt, messages) {
  return {
    assist_satellite_entity: "assist_satellite.living_room",
    generated_at: generatedAt,
    source: "assist_debug_cache",
    messages,
  };
}

assert.deepEqual(
  normalizeConfig({
    entity: "assist_satellite.living_room",
    display_scale: "999",
    height_mode: "custom",
    height: " calc(100dvh - 80px) ",
    max_messages: "999",
    max_initial_age: "300",
    clear_after: "10",
    show_header: true,
  }),
  {
    type: undefined,
    entity: "assist_satellite.living_room",
    display_scale: 250,
    height_mode: "custom",
    height: "calc(100dvh - 80px)",
    max_messages: 100,
    max_initial_age: 300,
    clear_after: 10,
    show_header: true,
  }
);

assert.equal(
  normalizeConfig({
    entity: "assist_satellite.living_room",
    height_mode: "invalid",
    height: 720,
  }).height_mode,
  "default"
);

assert.equal(
  normalizeConfig({
    entity: "assist_satellite.living_room",
    display_scale: "74",
  }).display_scale,
  75
);

assert.equal(
  normalizeConfig({
    entity: "assist_satellite.living_room",
    display_scale: "127.5",
  }).display_scale,
  127.5
);

assert.throws(
  () => normalizeConfig({ entity: "sensor.living_room" }),
  /assist_satellite/
);

assert.equal(isNearBottom(1000, 700, 300), true);
assert.equal(isNearBottom(1000, 620, 300), true);
assert.equal(isNearBottom(1000, 500, 300), false);
assert.equal(isNearBottom(240, 0, 300), true);
assert.equal(remainingViewportHeight(80, 900), 820);
assert.equal(remainingViewportHeight(800, 900), 240);
assert.equal(remainingViewportHeight(Number.NaN, 900), 240);

assert.equal(
  isSnapshotFresh(snapshot("2026-08-11T19:56:00.000Z", []), 300, now),
  true
);
assert.equal(
  isSnapshotFresh(snapshot("2026-08-11T19:54:00.000Z", []), 300, now),
  false
);

const firstSnapshot = snapshot("2026-08-11T19:59:30.000Z", [
  message("run_1:user", "user", "Wie wird das Wetter?", "final"),
]);
assert.deepEqual(
  hydrateFromSnapshot([], firstSnapshot, { max_messages: 20, max_initial_age: 300 }, now)
    .map((item) => item.id),
  ["run_1:user"]
);
assert.deepEqual(
  applyTranscriptEvent(
    [],
    { type: "snapshot", snapshot: firstSnapshot },
    { max_messages: 20, max_initial_age: 300 },
    now
  ).map((item) => item.id),
  ["run_1:user"]
);

const oldSnapshot = snapshot("2026-08-11T19:50:00.000Z", [
  message("run_old:user", "user", "Old", "final"),
]);
assert.deepEqual(
  hydrateFromSnapshot([], oldSnapshot, { max_messages: 20, max_initial_age: 300 }, now),
  []
);
assert.deepEqual(
  hydrateFromSnapshot(
    [message("run_keep:user", "user", "Keep", "final")],
    oldSnapshot,
    { max_messages: 20, max_initial_age: 300 },
    now
  ).map((item) => item.id),
  ["run_keep:user"]
);

let messages = applyTranscriptEvent(
  [],
  {
    type: "message_add",
    message: message("run_2:assistant", "assistant", "", "streaming"),
  },
  { max_messages: 20, max_initial_age: 300 },
  now
);
assert.equal(messages[0].status, "streaming");
assert.equal(messages[0].text, "");

messages = applyTranscriptEvent(
  messages,
  {
    type: "message_replace",
    message: message(
      "run_2:assistant",
      "assistant",
      "Final answer",
      "final",
      "2026-08-11T19:59:10.000Z"
    ),
  },
  { max_messages: 20, max_initial_age: 300 },
  now
);
assert.equal(messages.length, 1);
assert.equal(messages[0].text, "Final answer");
assert.equal(messages[0].status, "final");

const newerBrowserMessage = message(
  "run_3:assistant",
  "assistant",
  "Newer browser text",
  "streaming",
  "2026-08-11T19:59:50.000Z"
);
const olderSnapshotMessage = message(
  "run_3:assistant",
  "assistant",
  "Older snapshot text",
  "streaming",
  "2026-08-11T19:59:40.000Z"
);
assert.equal(
  upsertMessages([newerBrowserMessage], [olderSnapshotMessage], 20)[0].text,
  "Newer browser text"
);

const trimmed = upsertMessages(
  [
    message("run_1:user", "user", "1", "final", "2026-08-11T19:59:01.000Z"),
    message("run_2:user", "user", "2", "final", "2026-08-11T19:59:02.000Z"),
  ],
  [message("run_3:user", "user", "3", "final", "2026-08-11T19:59:03.000Z")],
  2
);
assert.deepEqual(
  trimmed.map((item) => item.text),
  ["2", "3"]
);
