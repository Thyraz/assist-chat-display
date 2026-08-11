const CARD_TYPE = "assist-chat-display-card";
const WS_TYPE_SUBSCRIBE = "assist_chat_display/subscribe";
const ASSIST_SATELLITE_DOMAIN = "assist_satellite";

export const DEFAULT_CONFIG = Object.freeze({
  max_messages: 20,
  max_initial_age: 300,
  clear_after: 0,
  show_header: false,
});

const NUMBER_LIMITS = Object.freeze({
  max_messages: { min: 2, max: 100 },
  max_initial_age: { min: 0, max: 86400 },
  clear_after: { min: 0, max: 86400 },
});

let warnedMarkdownUnavailable = false;

export function normalizeConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Card config is required.");
  }

  const entity = String(config.entity ?? "").trim();
  if (!entity) {
    throw new Error("Entity is required.");
  }

  if (!entity.startsWith(`${ASSIST_SATELLITE_DOMAIN}.`)) {
    throw new Error("Entity must be an assist_satellite.* entity.");
  }

  return {
    type: config.type,
    entity,
    max_messages: normalizeInteger(
      config.max_messages,
      DEFAULT_CONFIG.max_messages,
      NUMBER_LIMITS.max_messages
    ),
    max_initial_age: normalizeInteger(
      config.max_initial_age,
      DEFAULT_CONFIG.max_initial_age,
      NUMBER_LIMITS.max_initial_age
    ),
    clear_after: normalizeInteger(
      config.clear_after,
      DEFAULT_CONFIG.clear_after,
      NUMBER_LIMITS.clear_after
    ),
    show_header: Boolean(config.show_header ?? DEFAULT_CONFIG.show_header),
  };
}

function normalizeInteger(value, fallback, limits) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(limits.max, Math.max(limits.min, Math.trunc(parsed)));
}

export function isSnapshotFresh(snapshot, maxInitialAgeSeconds, nowMs = Date.now()) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.generated_at) {
    return false;
  }

  const generatedAtMs = Date.parse(snapshot.generated_at);
  if (!Number.isFinite(generatedAtMs)) {
    return false;
  }

  return nowMs - generatedAtMs <= maxInitialAgeSeconds * 1000;
}

export function applyTranscriptEvent(messages, event, config, nowMs = Date.now()) {
  const normalizedConfig = normalizeMergeConfig(config);

  if (event?.type === "snapshot") {
    return hydrateFromSnapshot(
      messages,
      event.snapshot,
      normalizedConfig,
      nowMs
    );
  }

  if (!event?.message) {
    return messages.slice();
  }

  return upsertMessages(messages, [event.message], normalizedConfig.max_messages);
}

export function hydrateFromSnapshot(messages, snapshot, config, nowMs = Date.now()) {
  const normalizedConfig = normalizeMergeConfig(config);

  if (
    !isSnapshotFresh(snapshot, normalizedConfig.max_initial_age, nowMs) ||
    !Array.isArray(snapshot.messages)
  ) {
    return trimMessages(sortMessages(messages), normalizedConfig.max_messages);
  }

  return upsertMessages(
    messages,
    snapshot.messages,
    normalizedConfig.max_messages
  );
}

export function upsertMessages(messages, incomingMessages, maxMessages) {
  const byId = new Map();

  for (const message of messages ?? []) {
    if (isTranscriptMessage(message)) {
      byId.set(message.id, { ...message });
    }
  }

  for (const message of incomingMessages ?? []) {
    if (!isTranscriptMessage(message)) {
      continue;
    }

    const existing = byId.get(message.id);
    if (!existing || compareUpdatedAt(message, existing) >= 0) {
      byId.set(message.id, {
        ...existing,
        ...message,
        details: message.details ?? existing?.details,
      });
    }
  }

  return trimMessages(sortMessages([...byId.values()]), maxMessages);
}

function normalizeMergeConfig(config) {
  return {
    max_messages: normalizeInteger(
      config?.max_messages,
      DEFAULT_CONFIG.max_messages,
      NUMBER_LIMITS.max_messages
    ),
    max_initial_age: normalizeInteger(
      config?.max_initial_age,
      DEFAULT_CONFIG.max_initial_age,
      NUMBER_LIMITS.max_initial_age
    ),
  };
}

function isTranscriptMessage(message) {
  return Boolean(
    message &&
      typeof message === "object" &&
      typeof message.id === "string" &&
      typeof message.role === "string"
  );
}

function sortMessages(messages) {
  return messages.slice().sort((left, right) => {
    const createdDiff = compareIso(left.created_at, right.created_at);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    const updatedDiff = compareIso(left.updated_at, right.updated_at);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

function trimMessages(messages, maxMessages) {
  const normalizedMax = normalizeInteger(
    maxMessages,
    DEFAULT_CONFIG.max_messages,
    NUMBER_LIMITS.max_messages
  );
  if (messages.length <= normalizedMax) {
    return messages;
  }
  return messages.slice(messages.length - normalizedMax);
}

function compareUpdatedAt(left, right) {
  return compareIso(left.updated_at ?? left.created_at, right.updated_at ?? right.created_at);
}

function compareIso(left, right) {
  const leftMs = Date.parse(left ?? "");
  const rightMs = Date.parse(right ?? "");

  if (!Number.isFinite(leftMs) && !Number.isFinite(rightMs)) {
    return 0;
  }
  if (!Number.isFinite(leftMs)) {
    return -1;
  }
  if (!Number.isFinite(rightMs)) {
    return 1;
  }
  return leftMs - rightMs;
}

function defineCard() {
  class AssistChatDisplayCard extends HTMLElement {
    static getConfigForm() {
      return {
        schema: [
          {
            name: "entity",
            required: true,
            selector: {
              entity: {
                domain: ASSIST_SATELLITE_DOMAIN,
              },
            },
          },
          {
            type: "grid",
            name: "",
            schema: [
              {
                name: "max_messages",
                selector: {
                  number: {
                    mode: "box",
                    min: NUMBER_LIMITS.max_messages.min,
                    max: NUMBER_LIMITS.max_messages.max,
                    step: 1,
                  },
                },
              },
              {
                name: "max_initial_age",
                selector: {
                  number: {
                    mode: "box",
                    min: NUMBER_LIMITS.max_initial_age.min,
                    max: NUMBER_LIMITS.max_initial_age.max,
                    unit_of_measurement: "s",
                    step: 1,
                  },
                },
              },
              {
                name: "clear_after",
                selector: {
                  number: {
                    mode: "box",
                    min: NUMBER_LIMITS.clear_after.min,
                    max: NUMBER_LIMITS.clear_after.max,
                    unit_of_measurement: "s",
                    step: 1,
                  },
                },
              },
              {
                name: "show_header",
                selector: {
                  boolean: {},
                },
              },
            ],
          },
        ],
        computeLabel: (schema) =>
          ({
            entity: "Assist Satellite",
            max_messages: "Maximum messages",
            max_initial_age: "Initial snapshot age",
            clear_after: "Clear after inactivity",
            show_header: "Show header",
          })[schema.name],
        computeHelper: (schema) =>
          ({
            max_initial_age: "Ignore older debug snapshots when the card loads.",
            clear_after: "Set to 0 to keep messages visible.",
          })[schema.name],
        assertConfig: (config) => {
          normalizeConfig(config);
        },
      };
    }

    static getStubConfig(hass) {
      const entity = Object.keys(hass?.states ?? {}).find((entityId) =>
        entityId.startsWith(`${ASSIST_SATELLITE_DOMAIN}.`)
      );
      return {
        entity: entity ?? `${ASSIST_SATELLITE_DOMAIN}.living_room`,
        ...DEFAULT_CONFIG,
      };
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._messages = [];
      this._status = "idle";
      this._statusMessage = "";
      this._unsubscribe = undefined;
      this._subscribedEntity = undefined;
      this._clearTimer = undefined;
      this._manualReconnectTimer = undefined;
      this._manualReconnectDelay = 1000;
      this._connectionListeners = [];
      this._connected = false;
      this._rendered = false;
      this._forceScroll = false;
    }

    setConfig(config) {
      const nextConfig = normalizeConfig(config);
      const entityChanged = this._config?.entity !== nextConfig.entity;
      this._config = nextConfig;

      if (entityChanged) {
        this._messages = [];
        this._subscribedEntity = undefined;
        this._unsubscribeSubscription();
      }

      this._render();
      this._subscribeIfReady();
    }

    set hass(hass) {
      const oldConnection = this._hass?.connection;

      if (oldConnection !== hass?.connection) {
        this._removeConnectionListeners(oldConnection);
        this._hass = hass;
        this._addConnectionListeners();
        this._subscribedEntity = undefined;
        this._unsubscribeSubscription();
      } else {
        this._hass = hass;
      }

      this._render();
      this._subscribeIfReady();
    }

    connectedCallback() {
      this._connected = true;
      this._render();
      this._addConnectionListeners();
      this._subscribeIfReady();
    }

    disconnectedCallback() {
      this._connected = false;
      this._removeConnectionListeners();
      this._unsubscribeSubscription();
      this._clearTimers();
    }

    getCardSize() {
      return 4;
    }

    getGridOptions() {
      return {
        rows: 4,
        columns: 6,
        min_rows: 2,
        min_columns: 3,
      };
    }

    async _subscribeIfReady() {
      if (
        !this._connected ||
        !this._hass?.connection ||
        !this._config ||
        this._subscribedEntity === this._config.entity
      ) {
        return;
      }

      await this._unsubscribeSubscription();
      this._subscribedEntity = this._config.entity;
      this._setStatus("connecting", "");

      try {
        this._unsubscribe = await this._hass.connection.subscribeMessage(
          (event) => this._handleTranscriptEvent(event),
          {
            type: WS_TYPE_SUBSCRIBE,
            assist_satellite_entity: this._config.entity,
          }
        );
        this._manualReconnectDelay = 1000;
        this._setStatus("ready", "");
      } catch (error) {
        this._subscribedEntity = undefined;
        this._setStatus("error", errorToMessage(error));
        if (isConnectionLost(error)) {
          this._scheduleManualReconnect();
        }
      }
    }

    async _unsubscribeSubscription() {
      this._clearManualReconnect();
      if (!this._unsubscribe) {
        return;
      }

      const unsubscribe = this._unsubscribe;
      this._unsubscribe = undefined;
      try {
        await unsubscribe();
      } catch (error) {
        console.warn("Assist Chat Display failed to unsubscribe", error);
      }
    }

    _handleTranscriptEvent(event) {
      const nearBottom = this._isNearBottom();
      const forceScroll =
        event?.message?.role === "user" && event?.type === "message_add";
      this._messages = applyTranscriptEvent(this._messages, event, this._config);
      this._forceScroll = forceScroll || nearBottom;
      this._setStatus("ready", "");
      this._scheduleClear();
      this._render();
    }

    _addConnectionListeners() {
      const connection = this._hass?.connection;
      if (!this._connected || !connection || this._connectionListeners.length > 0) {
        return;
      }

      const disconnected = () => {
        this._setStatus("disconnected", "Connection lost");
      };
      const ready = () => {
        this._setStatus("ready", "");
      };
      const reconnectError = () => {
        this._setStatus("disconnected", "Reconnecting...");
      };

      connection.addEventListener?.("disconnected", disconnected);
      connection.addEventListener?.("ready", ready);
      connection.addEventListener?.("reconnect-error", reconnectError);
      this._connectionListeners = [
        ["disconnected", disconnected],
        ["ready", ready],
        ["reconnect-error", reconnectError],
      ];
    }

    _removeConnectionListeners(connection = this._hass?.connection) {
      if (!connection) {
        this._connectionListeners = [];
        return;
      }

      for (const [eventType, listener] of this._connectionListeners) {
        connection.removeEventListener?.(eventType, listener);
      }
      this._connectionListeners = [];
    }

    _scheduleManualReconnect() {
      this._clearManualReconnect();
      const delay = this._manualReconnectDelay;
      this._manualReconnectDelay = Math.min(this._manualReconnectDelay * 2, 30000);
      this._manualReconnectTimer = window.setTimeout(() => {
        this._manualReconnectTimer = undefined;
        this._subscribeIfReady();
      }, delay);
    }

    _clearManualReconnect() {
      if (this._manualReconnectTimer) {
        window.clearTimeout(this._manualReconnectTimer);
        this._manualReconnectTimer = undefined;
      }
    }

    _scheduleClear() {
      if (this._clearTimer) {
        window.clearTimeout(this._clearTimer);
        this._clearTimer = undefined;
      }

      if (!this._config?.clear_after || this._messages.length === 0) {
        return;
      }

      this._clearTimer = window.setTimeout(() => {
        this._clearTimer = undefined;
        this._messages = [];
        this._render();
      }, this._config.clear_after * 1000);
    }

    _clearTimers() {
      this._clearManualReconnect();
      if (this._clearTimer) {
        window.clearTimeout(this._clearTimer);
        this._clearTimer = undefined;
      }
    }

    _setStatus(status, message) {
      if (this._status === status && this._statusMessage === message) {
        return;
      }
      this._status = status;
      this._statusMessage = message;
      this._render();
    }

    _render() {
      if (!this.shadowRoot) {
        return;
      }

      if (!this._rendered) {
        this.shadowRoot.innerHTML = `
          <style>${CARD_STYLES}</style>
          <ha-card class="card">
            <div class="header" part="header"></div>
            <div class="messages" part="messages"></div>
            <div class="status" part="status"></div>
          </ha-card>
        `;
        this._rendered = true;
      }

      const header = this.shadowRoot.querySelector(".header");
      const messages = this.shadowRoot.querySelector(".messages");
      const status = this.shadowRoot.querySelector(".status");

      header.hidden = !this._config?.show_header;
      header.textContent = this._headerText();

      messages.replaceChildren(
        ...this._messages.map((message) => this._renderMessage(message))
      );

      const showStatus =
        this._status === "error" ||
        (this._status === "disconnected" && this._messages.length > 0);
      status.hidden = !showStatus;
      status.textContent = showStatus ? this._statusMessage : "";

      if (this._forceScroll) {
        this._forceScroll = false;
        window.requestAnimationFrame(() => this._scrollToBottom());
      }
    }

    _renderMessage(message) {
      const container = document.createElement("div");
      container.className = `message-container ${message.role}`;

      const bubble = document.createElement("div");
      bubble.className = `bubble ${message.role} ${message.status ?? ""}`;
      container.append(bubble);

      if (message.status === "error") {
        bubble.classList.add("error");
      }

      if (hasVisibleText(message)) {
        appendTextContent(bubble, message.text);
      } else if (message.status === "placeholder" || message.status === "streaming") {
        bubble.append(renderActivityDots());
      } else {
        bubble.hidden = true;
      }

      return container;
    }

    _headerText() {
      const entity = this._config?.entity;
      if (!entity) {
        return "";
      }

      const stateObj = this._hass?.states?.[entity];
      return stateObj?.attributes?.friendly_name ?? entity;
    }

    _isNearBottom() {
      const messages = this.shadowRoot?.querySelector(".messages");
      if (!messages) {
        return true;
      }

      return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
    }

    _scrollToBottom() {
      const messages = this.shadowRoot?.querySelector(".messages");
      if (!messages) {
        return;
      }
      messages.scrollTop = messages.scrollHeight;
    }
  }

  customElements.define(CARD_TYPE, AssistChatDisplayCard);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TYPE,
    name: "Assist Chat Display",
    preview: true,
    description: "Display the current Assist conversation for an Assist Satellite.",
    getEntitySuggestion: (_hass, entityId) => {
      if (!entityId?.startsWith(`${ASSIST_SATELLITE_DOMAIN}.`)) {
        return null;
      }

      return {
        config: {
          type: `custom:${CARD_TYPE}`,
          entity: entityId,
          ...DEFAULT_CONFIG,
        },
      };
    },
  });
}

function hasVisibleText(message) {
  return typeof message?.text === "string" && message.text.trim().length > 0;
}

function appendTextContent(parent, text) {
  if (customElements.get("ha-markdown")) {
    const markdown = document.createElement("ha-markdown");
    markdown.setAttribute("breaks", "");
    markdown.setAttribute("cache", "");
    markdown.content = text;
    parent.append(markdown);
    return;
  }

  if (!warnedMarkdownUnavailable) {
    console.warn(
      "Assist Chat Display: ha-markdown is unavailable, falling back to plain text."
    );
    warnedMarkdownUnavailable = true;
  }

  const plainText = document.createElement("div");
  plainText.className = "plain-text";
  plainText.textContent = text;
  parent.append(plainText);
}

function renderActivityDots() {
  const dots = document.createElement("div");
  dots.className = "activity-dots";
  dots.setAttribute("aria-label", "Assistant is responding");
  dots.setAttribute("role", "status");

  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.style.animationDelay = `${index * 0.16}s`;
    dots.append(dot);
  }

  return dots;
}

function errorToMessage(error) {
  const code = error?.code ?? error?.error?.code;
  const message = error?.message ?? error?.error?.message;

  if (code === "unauthorized") {
    return "No permission for this Assist Satellite";
  }

  if (code === "not_supported") {
    return "Assist Chat Display integration is not loaded";
  }

  if (message) {
    return String(message);
  }

  return "Could not connect to Assist Chat Display";
}

function isConnectionLost(error) {
  return error === 1 || error?.code === "connection_lost";
}

const CARD_STYLES = `
  :host {
    display: block;
    height: 100%;
    min-height: 0;
    --assist-chat-display-user-bubble-background: var(--blue-color, var(--primary-color, #2196f3));
    --assist-chat-display-assistant-bubble-background: var(--green-color, #4caf50);
    --assist-chat-display-user-bubble-color: var(--text-primary-color, #ffffff);
    --assist-chat-display-assistant-bubble-color: var(--text-primary-color, #ffffff);
    --assist-chat-display-error-bubble-background: var(--error-color, #db4437);
    --assist-chat-display-error-bubble-color: var(--text-primary-color, #ffffff);
    --assist-chat-display-padding: var(--ha-space-2, 8px);
    --assist-chat-display-gap: var(--ha-space-2, 8px);
    --assist-chat-display-radius: var(--ha-border-radius-xl, 20px);
    --assist-chat-display-font-size: var(--ha-font-size-l, 16px);
  }

  .card {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    background: transparent;
    border: 0;
    box-shadow: none;
    overflow: hidden;
  }

  .header {
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-s, 12px);
    line-height: 1.3;
    padding: var(--assist-chat-display-padding);
    padding-bottom: 0;
  }

  .messages {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--assist-chat-display-gap);
    padding: var(--assist-chat-display-padding);
    scrollbar-width: thin;
  }

  .message-container {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .message-container.user {
    align-items: flex-end;
  }

  .message-container.assistant {
    align-items: flex-start;
  }

  .bubble {
    box-sizing: border-box;
    max-width: min(82%, 720px);
    min-width: 34px;
    min-height: 30px;
    padding: 8px 11px;
    border-radius: var(--assist-chat-display-radius);
    font-size: var(--assist-chat-display-font-size);
    line-height: 1.35;
    overflow-wrap: anywhere;
    direction: var(--direction);
  }

  .bubble.user {
    border-bottom-right-radius: 4px;
    background: var(--assist-chat-display-user-bubble-background);
    color: var(--assist-chat-display-user-bubble-color);
    --markdown-link-color: currentColor;
  }

  .bubble.assistant {
    border-bottom-left-radius: 4px;
    background: var(--assist-chat-display-assistant-bubble-background);
    color: var(--assist-chat-display-assistant-bubble-color);
    --markdown-link-color: currentColor;
  }

  .bubble.error {
    background: var(--assist-chat-display-error-bubble-background);
    color: var(--assist-chat-display-error-bubble-color);
  }

  ha-markdown {
    --markdown-link-color: currentColor;
    --markdown-code-background-color: var(--assist-chat-display-markdown-code-background, rgba(255, 255, 255, 0.16));
    --markdown-code-text-color: currentColor;
    --markdown-list-indent: 1.15em;
  }

  ha-markdown:not(:has(ha-markdown-element)) {
    min-height: 1lh;
    min-width: 1lh;
    flex-shrink: 0;
  }

  .plain-text {
    white-space: pre-wrap;
  }

  .activity-dots {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: 34px;
    height: 14px;
    vertical-align: middle;
  }

  .activity-dots span {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.45;
    animation: assist-chat-display-dot 1.1s infinite ease-in-out;
  }

  .status {
    color: var(--error-color);
    font-size: var(--ha-font-size-s, 12px);
    line-height: 1.3;
    padding: 0 var(--assist-chat-display-padding) var(--assist-chat-display-padding);
  }

  @keyframes assist-chat-display-dot {
    0%, 70%, 100% {
      transform: translateY(0);
      opacity: 0.35;
    }

    35% {
      transform: translateY(-3px);
      opacity: 0.9;
    }
  }
`;

if (
  typeof window !== "undefined" &&
  window.customElements &&
  !window.customElements.get(CARD_TYPE)
) {
  defineCard();
}
