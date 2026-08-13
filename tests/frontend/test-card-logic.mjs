import assert from "node:assert/strict";

import {
  applyMessageMaxAge,
  applyTranscriptEvent,
  hasDisplayText,
  hydrateFromSnapshot,
  isNearBottom,
  messageActivityMs,
  nextMessageExpiryMs,
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
    message_max_age: "999999",
    show_header: true,
  }),
  {
    type: undefined,
    entity: "assist_satellite.living_room",
    display_scale: 250,
    height_mode: "custom",
    height: "calc(100dvh - 80px)",
    max_messages: 100,
    message_max_age: 86400,
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
  messageActivityMs(message("run_time:user", "user", "Recent", "final")),
  Date.parse("2026-08-11T19:59:00.000Z")
);

assert.deepEqual(
  applyMessageMaxAge(
    [
      message("run_recent:user", "user", "Recent", "final"),
      message("run_old:user", "user", "Old", "final", "2026-08-11T19:50:00.000Z"),
    ],
    300,
    now
  ).map((item) => item.id),
  ["run_recent:user"]
);

assert.deepEqual(
  applyMessageMaxAge(
    [message("run_old:user", "user", "Old", "final", "2026-08-11T19:50:00.000Z")],
    0,
    now
  ).map((item) => item.id),
  ["run_old:user"]
);

assert.equal(
  nextMessageExpiryMs(
    [message("run_recent:user", "user", "Recent", "final")],
    300,
    now
  ),
  Date.parse("2026-08-11T20:04:00.000Z")
);

const firstSnapshot = snapshot("2026-08-11T19:50:00.000Z", [
  message("run_1:user", "user", "Wie wird das Wetter?", "final"),
  message("run_old:user", "user", "Old", "final", "2026-08-11T19:50:00.000Z"),
]);
assert.deepEqual(
  hydrateFromSnapshot([], firstSnapshot, { max_messages: 20, message_max_age: 300 }, now)
    .map((item) => item.id),
  ["run_1:user"]
);
assert.deepEqual(
  applyTranscriptEvent(
    [],
    { type: "snapshot", snapshot: firstSnapshot },
    { max_messages: 20, message_max_age: 300 },
    now
  ).map((item) => item.id),
  ["run_1:user"]
);

const emptySnapshot = snapshot("2026-08-11T19:59:30.000Z", [
  message("run_old:user", "user", "Old", "final", "2026-08-11T19:50:00.000Z"),
]);
assert.deepEqual(
  hydrateFromSnapshot([], emptySnapshot, { max_messages: 20, message_max_age: 300 }, now),
  []
);
assert.deepEqual(
  hydrateFromSnapshot(
    [
      message("run_keep:user", "user", "Keep", "final"),
      message("run_drop:user", "user", "Drop", "final", "2026-08-11T19:50:00.000Z"),
    ],
    { messages: undefined },
    { max_messages: 20, message_max_age: 300 },
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
  { max_messages: 20, message_max_age: 300 },
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
  { max_messages: 20, message_max_age: 300 },
  now
);
assert.equal(messages.length, 1);
assert.equal(messages[0].text, "Final answer");
assert.equal(messages[0].status, "final");

assert.deepEqual(
  applyTranscriptEvent(
    messages,
    {
      type: "message_add",
      message: message(
        "run_expired:assistant",
        "assistant",
        "Expired",
        "final",
        "2026-08-11T19:50:00.000Z"
      ),
    },
    { max_messages: 20, message_max_age: 300 },
    now
  ).map((item) => item.id),
  ["run_2:assistant"]
);

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
  upsertMessages([newerBrowserMessage], [olderSnapshotMessage], 20, 300, now)[0].text,
  "Newer browser text"
);

const trimmed = upsertMessages(
  [
    message("run_1:user", "user", "1", "final", "2026-08-11T19:59:01.000Z"),
    message("run_2:user", "user", "2", "final", "2026-08-11T19:59:02.000Z"),
  ],
  [message("run_3:user", "user", "3", "final", "2026-08-11T19:59:03.000Z")],
  2,
  300,
  now
);
assert.deepEqual(
  trimmed.map((item) => item.text),
  ["2", "3"]
);

assert.equal(
  hasDisplayText(message("run_space:assistant", "assistant", " ", "final")),
  true
);
assert.equal(
  hasDisplayText(message("run_empty:assistant", "assistant", "", "final")),
  true
);
assert.equal(
  hasDisplayText(message("run_space:assistant", "assistant", " ", "streaming")),
  false
);
assert.equal(
  hasDisplayText(message("run_text:assistant", "assistant", "Hello", "streaming")),
  true
);

class TestElement {
  constructor() {
    this.style = { setProperty() {} };
    this.hidden = false;
  }

  attachShadow() {
    this.shadowRoot = {
      innerHTML: "",
      querySelector: () => ({
        addEventListener() {},
        replaceChildren() {},
        style: {},
        hidden: false,
        textContent: "",
      }),
      querySelectorAll: () => [],
    };
    return this.shadowRoot;
  }

  toggleAttribute(name, value) {
    this[name] = Boolean(value);
  }
}

const registry = new Map();
globalThis.HTMLElement = TestElement;
globalThis.window = {
  customElements: {
    get: (name) => registry.get(name),
    define: (name, klass) => registry.set(name, klass),
  },
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: clearTimeout,
  innerHeight: 800,
};
globalThis.customElements = globalThis.window.customElements;
globalThis.document = {
  createElement: (tag) => ({
    tag,
    className: "",
    style: {},
    hidden: false,
    textContent: "",
    setAttribute() {},
    append() {},
    replaceChildren() {},
    addEventListener() {},
  }),
};

await import(
  "../../custom_components/assist_chat_display/www/assist-chat-display-card.js?lifecycle-test"
);

const Card = registry.get("assist-chat-display-card");
const card = new Card();
card._render = () => {};
card._addHeightListeners = () => {};
card._removeHeightListeners = () => {};
card._addConnectionListeners = () => {};
card._removeConnectionListeners = () => {};
card._setCardHeight = () => {};
card._clearTimers = () => {};

let subscribeCalls = 0;
let unsubscribeCalls = 0;
const connection = {
  subscribeMessage: async () => {
    subscribeCalls += 1;
    return async () => {
      unsubscribeCalls += 1;
    };
  },
};

card.hass = { connection, states: {} };
card.setConfig({ entity: "assist_satellite.kitchen" });
card.connectedCallback();
await new Promise((resolve) => setTimeout(resolve, 0));
card.disconnectedCallback();
await new Promise((resolve) => setTimeout(resolve, 0));
card.connectedCallback();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(subscribeCalls, 2);
assert.equal(unsubscribeCalls, 1);
