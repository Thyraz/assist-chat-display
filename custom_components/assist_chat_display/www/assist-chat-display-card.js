const CARD_TYPE = "assist-chat-display-card";
const WS_TYPE_SUBSCRIBE = "assist_chat_display/subscribe";
const ASSIST_SATELLITE_DOMAIN = "assist_satellite";
const HEIGHT_MODE_DEFAULT = "default";
const HEIGHT_MODE_VIEWPORT = "viewport";
const HEIGHT_MODE_CUSTOM = "custom";
const HEIGHT_MODES = Object.freeze([
  HEIGHT_MODE_DEFAULT,
  HEIGHT_MODE_VIEWPORT,
  HEIGHT_MODE_CUSTOM,
]);

export const DEFAULT_CONFIG = Object.freeze({
  display_scale: 100,
  height_mode: HEIGHT_MODE_DEFAULT,
  height: "",
  max_messages: 20,
  message_max_age: 300,
  show_header: false,
});

const NUMBER_LIMITS = Object.freeze({
  display_scale: { min: 75, max: 250 },
  max_messages: { min: 2, max: 100 },
  message_max_age: { min: 0, max: 86400 },
});

const MIN_AUTO_SCROLL_DISTANCE = 96;
const MIN_VIEWPORT_HEIGHT = 240;

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
    display_scale: normalizeNumber(
      config.display_scale,
      DEFAULT_CONFIG.display_scale,
      NUMBER_LIMITS.display_scale
    ),
    height_mode: normalizeHeightMode(config.height_mode),
    height: normalizeHeight(config.height),
    max_messages: normalizeInteger(
      config.max_messages,
      DEFAULT_CONFIG.max_messages,
      NUMBER_LIMITS.max_messages
    ),
    message_max_age: normalizeInteger(
      config.message_max_age,
      DEFAULT_CONFIG.message_max_age,
      NUMBER_LIMITS.message_max_age
    ),
    show_header: Boolean(config.show_header ?? DEFAULT_CONFIG.show_header),
  };
}

function normalizeHeightMode(value) {
  const mode = String(value ?? DEFAULT_CONFIG.height_mode).trim();
  return HEIGHT_MODES.includes(mode) ? mode : DEFAULT_CONFIG.height_mode;
}

function normalizeHeight(value) {
  return String(value ?? "").trim();
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

function normalizeNumber(value, fallback, limits) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(limits.max, Math.max(limits.min, parsed));
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
    return applyMessageMaxAge(
      trimMessages(sortMessages(messages), normalizedConfig.max_messages),
      normalizedConfig.message_max_age,
      nowMs
    );
  }

  return upsertMessages(
    messages,
    [event.message],
    normalizedConfig.max_messages,
    normalizedConfig.message_max_age,
    nowMs
  );
}

export function hydrateFromSnapshot(messages, snapshot, config, nowMs = Date.now()) {
  const normalizedConfig = normalizeMergeConfig(config);

  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !Array.isArray(snapshot.messages)
  ) {
    return applyMessageMaxAge(
      trimMessages(sortMessages(messages), normalizedConfig.max_messages),
      normalizedConfig.message_max_age,
      nowMs
    );
  }

  return upsertMessages(
    messages,
    snapshot.messages,
    normalizedConfig.max_messages,
    normalizedConfig.message_max_age,
    nowMs
  );
}

export function upsertMessages(
  messages,
  incomingMessages,
  maxMessages,
  messageMaxAge = DEFAULT_CONFIG.message_max_age,
  nowMs = Date.now()
) {
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

  return applyMessageMaxAge(
    trimMessages(sortMessages([...byId.values()]), maxMessages),
    messageMaxAge,
    nowMs
  );
}

export function isNearBottom(scrollHeight, scrollTop, clientHeight) {
  if (scrollHeight <= clientHeight + 1) {
    return true;
  }

  const threshold = Math.max(MIN_AUTO_SCROLL_DISTANCE, clientHeight * 0.25);
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export function remainingViewportHeight(top, viewportHeight) {
  const remaining = Number(viewportHeight) - Number(top);

  if (!Number.isFinite(remaining)) {
    return MIN_VIEWPORT_HEIGHT;
  }

  return Math.max(MIN_VIEWPORT_HEIGHT, Math.floor(remaining));
}

function normalizeMergeConfig(config) {
  return {
    max_messages: normalizeInteger(
      config?.max_messages,
      DEFAULT_CONFIG.max_messages,
      NUMBER_LIMITS.max_messages
    ),
    message_max_age: normalizeInteger(
      config?.message_max_age,
      DEFAULT_CONFIG.message_max_age,
      NUMBER_LIMITS.message_max_age
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

export function applyMessageMaxAge(messages, messageMaxAge, nowMs = Date.now()) {
  const normalizedMaxAge = normalizeInteger(
    messageMaxAge,
    DEFAULT_CONFIG.message_max_age,
    NUMBER_LIMITS.message_max_age
  );

  if (normalizedMaxAge === 0) {
    return messages.slice();
  }

  return messages.filter((message) => {
    const activityMs = messageActivityMs(message);
    return (
      Number.isFinite(activityMs) &&
      nowMs - activityMs <= normalizedMaxAge * 1000
    );
  });
}

export function messageActivityMs(message) {
  const updatedMs = Date.parse(message?.updated_at ?? "");
  if (Number.isFinite(updatedMs)) {
    return updatedMs;
  }

  return Date.parse(message?.created_at ?? "");
}

export function nextMessageExpiryMs(messages, messageMaxAge, nowMs = Date.now()) {
  const normalizedMaxAge = normalizeInteger(
    messageMaxAge,
    DEFAULT_CONFIG.message_max_age,
    NUMBER_LIMITS.message_max_age
  );

  if (normalizedMaxAge === 0) {
    return undefined;
  }

  const expiryTimes = (messages ?? [])
    .map((message) => messageActivityMs(message) + normalizedMaxAge * 1000)
    .filter((expiryMs) => Number.isFinite(expiryMs) && expiryMs > nowMs);

  return expiryTimes.length > 0 ? Math.min(...expiryTimes) : undefined;
}

function compareUpdatedAt(left, right) {
  return compareIso(
    left.updated_at ?? left.created_at,
    right.updated_at ?? right.created_at
  );
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
            name: "display_scale",
            selector: {
              number: {
                mode: "slider",
                min: NUMBER_LIMITS.display_scale.min,
                max: NUMBER_LIMITS.display_scale.max,
                unit_of_measurement: "%",
                step: 5,
              },
            },
          },
          {
            type: "grid",
            name: "",
            schema: [
              {
                name: "height_mode",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      {
                        value: HEIGHT_MODE_DEFAULT,
                        label: "Section dashboard / Default",
                      },
                      {
                        value: HEIGHT_MODE_VIEWPORT,
                        label: "Panel dashboard / Full height",
                      },
                      {
                        value: HEIGHT_MODE_CUSTOM,
                        label: "Custom height",
                      },
                    ],
                  },
                },
              },
              {
                name: "height",
                selector: {
                  text: {},
                },
              },
            ],
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
                name: "message_max_age",
                selector: {
                  number: {
                    mode: "box",
                    min: NUMBER_LIMITS.message_max_age.min,
                    max: NUMBER_LIMITS.message_max_age.max,
                    unit_of_measurement: "s",
                    step: 1,
                  },
                },
              },
            ],
          },
          {
            type: "grid",
            name: "",
            schema: [
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
            display_scale: "Display scale",
            height_mode: "Height mode",
            height: "Custom height",
            max_messages: "Maximum messages",
            message_max_age: "Hide messages older than",
            show_header: "Show header",
          })[schema.name],
        computeHelper: (schema) =>
          ({
            height: "Used when height mode is Custom.",
            message_max_age: "Set to 0 to keep messages visible.",
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
      this._messageAgeTimer = undefined;
      this._manualReconnectTimer = undefined;
      this._manualReconnectDelay = 1000;
      this._scrollAnimationFrames = [];
      this._scrollRequestToken = 0;
      this._stickToBottom = true;
      this._resizeObserver = undefined;
      this._connectionListeners = [];
      this._heightListeners = [];
      this._heightAnimationFrame = undefined;
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
      } else {
        this._messages = applyMessageMaxAge(
          trimMessages(sortMessages(this._messages), this._config.max_messages),
          this._config.message_max_age
        );
      }

      this._render();
      this._scheduleMessageExpiry();
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
      this._addHeightListeners();
      this._addConnectionListeners();
      this._scheduleMessageExpiry();
      this._subscribeIfReady();
    }

    disconnectedCallback() {
      this._connected = false;
      this._removeHeightListeners();
      this._setCardHeight("");
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
        event?.type === "snapshot" ||
        (event?.message?.role === "user" && event?.type === "message_add");
      this._messages = applyTranscriptEvent(this._messages, event, this._config);
      this._forceScroll = forceScroll || this._stickToBottom || nearBottom;
      if (this._forceScroll) {
        this._stickToBottom = true;
      }
      this._setStatus("ready", "", false);
      this._scheduleMessageExpiry();
      this._render();
    }

    _addHeightListeners() {
      if (!this._connected || this._heightListeners.length > 0) {
        return;
      }

      const updateHeight = () => this._scheduleHeightUpdate();
      window.addEventListener("resize", updateHeight);
      this._heightListeners.push([window, "resize", updateHeight]);

      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", updateHeight);
        window.visualViewport.addEventListener("scroll", updateHeight);
        this._heightListeners.push(
          [window.visualViewport, "resize", updateHeight],
          [window.visualViewport, "scroll", updateHeight]
        );
      }
    }

    _removeHeightListeners() {
      for (const [target, eventType, listener] of this._heightListeners) {
        target.removeEventListener?.(eventType, listener);
      }
      this._heightListeners = [];
      if (this._heightAnimationFrame !== undefined) {
        window.cancelAnimationFrame(this._heightAnimationFrame);
        this._heightAnimationFrame = undefined;
      }
    }

    _scheduleHeightUpdate() {
      if (!this._connected || this._heightAnimationFrame !== undefined) {
        return;
      }

      this._heightAnimationFrame = window.requestAnimationFrame(() => {
        this._heightAnimationFrame = undefined;
        this._applyHeightPolicy();
      });
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

    _scheduleMessageExpiry() {
      if (this._messageAgeTimer) {
        window.clearTimeout(this._messageAgeTimer);
        this._messageAgeTimer = undefined;
      }

      if (!this._connected || !this._config || this._messages.length === 0) {
        return;
      }

      const nowMs = Date.now();
      const filteredMessages = applyMessageMaxAge(
        this._messages,
        this._config.message_max_age,
        nowMs
      );
      if (filteredMessages.length !== this._messages.length) {
        this._messages = filteredMessages;
        this._render();
      }

      const expiryMs = nextMessageExpiryMs(
        this._messages,
        this._config.message_max_age,
        nowMs
      );
      if (expiryMs === undefined) {
        return;
      }

      this._messageAgeTimer = window.setTimeout(() => {
        this._messageAgeTimer = undefined;
        const nextMessages = applyMessageMaxAge(
          this._messages,
          this._config.message_max_age
        );
        if (nextMessages.length !== this._messages.length) {
          this._messages = nextMessages;
          this._render();
        }
        this._scheduleMessageExpiry();
      }, Math.max(1, expiryMs - nowMs + 1));
    }

    _clearTimers() {
      this._clearManualReconnect();
      this._clearScrollFrames();
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = undefined;
      }
      if (this._messageAgeTimer) {
        window.clearTimeout(this._messageAgeTimer);
        this._messageAgeTimer = undefined;
      }
    }

    _setStatus(status, message, render = true) {
      if (this._status === status && this._statusMessage === message) {
        return;
      }
      this._status = status;
      this._statusMessage = message;
      if (render) {
        this._render();
      }
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
        this.shadowRoot.querySelector(".messages").addEventListener(
          "scroll",
          () => {
            this._stickToBottom = this._isNearBottom();
          },
          { passive: true }
        );
        this._observeMessageLayout();
      }
      this._observeMessageLayout();

      const header = this.shadowRoot.querySelector(".header");
      const messages = this.shadowRoot.querySelector(".messages");
      const status = this.shadowRoot.querySelector(".status");

      header.hidden = !this._config?.show_header;
      header.textContent = this._headerText();
      this.style.setProperty(
        "--assist-chat-display-config-scale",
        String((this._config?.display_scale ?? DEFAULT_CONFIG.display_scale) / 100)
      );
      this._applyHeightPolicy();

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
        this._requestScrollToBottom();
      }
    }

    _applyHeightPolicy() {
      const mode = this._config?.height_mode ?? DEFAULT_CONFIG.height_mode;

      if (mode === HEIGHT_MODE_VIEWPORT) {
        this._setCardHeight(`${this._remainingViewportHeight()}px`);
        return;
      }

      if (mode === HEIGHT_MODE_CUSTOM && this._config?.height) {
        this._setCardHeight(this._config.height);
        return;
      }

      this._setCardHeight("");
    }

    _remainingViewportHeight() {
      return remainingViewportHeight(
        this.getBoundingClientRect().top,
        window.visualViewport?.height ?? window.innerHeight
      );
    }

    _setCardHeight(height) {
      this.style.height = height;
      const card = this.shadowRoot?.querySelector(".card");
      if (card) {
        card.style.height = height || "";
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

      if (hasDisplayText(message)) {
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

      return isNearBottom(
        messages.scrollHeight,
        messages.scrollTop,
        messages.clientHeight
      );
    }

    _requestScrollToBottom() {
      const token = ++this._scrollRequestToken;
      this._clearScrollFrames(false);
      const markdownElements = [
        ...this.shadowRoot.querySelectorAll(".messages ha-markdown"),
      ];

      const scrollIfCurrent = () => {
        if (token !== this._scrollRequestToken || !this._connected) {
          return;
        }
        this._scrollToBottom();
      };

      scrollIfCurrent();

      this._afterAnimationFrame()
        .then(() => {
          scrollIfCurrent();
          return this._waitForMarkdown(markdownElements);
        })
        .then(() => this._afterAnimationFrame())
        .then(scrollIfCurrent);
    }

    _observeMessageLayout() {
      if (this._resizeObserver || !window.ResizeObserver) {
        return;
      }

      const messages = this.shadowRoot?.querySelector(".messages");
      if (!messages) {
        return;
      }

      this._resizeObserver = new ResizeObserver(() => {
        if (this._stickToBottom) {
          this._requestScrollToBottom();
        }
      });
      this._resizeObserver.observe(messages);
    }

    _afterAnimationFrame() {
      return new Promise((resolve) => {
        const frame = window.requestAnimationFrame(resolve);
        this._scrollAnimationFrames.push(frame);
      });
    }

    async _waitForMarkdown(markdownElements) {
      const updates = markdownElements
        .map((element) => element.updateComplete)
        .filter((updateComplete) => updateComplete?.then);

      if (updates.length === 0) {
        return;
      }

      await Promise.allSettled(updates);
    }

    _clearScrollFrames(invalidate = true) {
      if (invalidate) {
        this._scrollRequestToken += 1;
      }
      for (const frame of this._scrollAnimationFrames) {
        window.cancelAnimationFrame(frame);
      }
      this._scrollAnimationFrames = [];
    }

    _scrollToBottom() {
      const messages = this.shadowRoot?.querySelector(".messages");
      if (!messages) {
        return;
      }
      messages.scrollTop = messages.scrollHeight;
      this._stickToBottom = true;
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

export function hasDisplayText(message) {
  if (typeof message?.text !== "string") {
    return false;
  }

  if (message.status === "placeholder" || message.status === "streaming") {
    return message.text.trim().length > 0;
  }

  return true;
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
    --assist-chat-display-config-scale: 1;
    --assist-chat-display-scale: var(--assist-chat-display-config-scale);
    --assist-chat-display-padding: calc(var(--ha-space-2, 8px) * var(--assist-chat-display-scale));
    --assist-chat-display-gap: calc(var(--ha-space-2, 8px) * var(--assist-chat-display-scale));
    --assist-chat-display-radius: calc(var(--ha-border-radius-xl, 20px) * var(--assist-chat-display-scale));
    --assist-chat-display-font-size: calc(var(--ha-font-size-l, 16px) * var(--assist-chat-display-scale));
    --assist-chat-display-header-font-size: calc(var(--ha-font-size-s, 12px) * var(--assist-chat-display-scale));
    --assist-chat-display-status-font-size: calc(var(--ha-font-size-s, 12px) * var(--assist-chat-display-scale));
    --assist-chat-display-bubble-padding-block: calc(8px * var(--assist-chat-display-scale));
    --assist-chat-display-bubble-padding-inline: calc(11px * var(--assist-chat-display-scale));
    --assist-chat-display-bubble-min-width: calc(34px * var(--assist-chat-display-scale));
    --assist-chat-display-bubble-min-height: calc(30px * var(--assist-chat-display-scale));
    --assist-chat-display-bubble-max-width: calc(720px * var(--assist-chat-display-scale));
    --assist-chat-display-tail-radius: calc(4px * var(--assist-chat-display-scale));
    --assist-chat-display-activity-width: calc(34px * var(--assist-chat-display-scale));
    --assist-chat-display-activity-height: calc(14px * var(--assist-chat-display-scale));
    --assist-chat-display-activity-gap: calc(4px * var(--assist-chat-display-scale));
    --assist-chat-display-dot-size: calc(6px * var(--assist-chat-display-scale));
    --assist-chat-display-dot-rise: calc(-3px * var(--assist-chat-display-scale));
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
    font-size: var(--assist-chat-display-header-font-size);
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
    max-width: min(82%, var(--assist-chat-display-bubble-max-width));
    min-width: var(--assist-chat-display-bubble-min-width);
    min-height: var(--assist-chat-display-bubble-min-height);
    padding: var(--assist-chat-display-bubble-padding-block) var(--assist-chat-display-bubble-padding-inline);
    border-radius: var(--assist-chat-display-radius);
    font-size: var(--assist-chat-display-font-size);
    line-height: 1.35;
    overflow-wrap: anywhere;
    direction: var(--direction);
  }

  .bubble.user {
    border-bottom-right-radius: var(--assist-chat-display-tail-radius);
    background: var(--assist-chat-display-user-bubble-background);
    color: var(--assist-chat-display-user-bubble-color);
    --markdown-link-color: currentColor;
  }

  .bubble.assistant {
    border-bottom-left-radius: var(--assist-chat-display-tail-radius);
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
    gap: var(--assist-chat-display-activity-gap);
    width: var(--assist-chat-display-activity-width);
    height: var(--assist-chat-display-activity-height);
    vertical-align: middle;
  }

  .activity-dots span {
    width: var(--assist-chat-display-dot-size);
    height: var(--assist-chat-display-dot-size);
    border-radius: 999px;
    background: currentColor;
    opacity: 0.45;
    animation: assist-chat-display-dot 1.1s infinite ease-in-out;
  }

  .status {
    color: var(--error-color);
    font-size: var(--assist-chat-display-status-font-size);
    line-height: 1.3;
    padding: 0 var(--assist-chat-display-padding) var(--assist-chat-display-padding);
  }

  @keyframes assist-chat-display-dot {
    0%, 70%, 100% {
      transform: translateY(0);
      opacity: 0.35;
    }

    35% {
      transform: translateY(var(--assist-chat-display-dot-rise));
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
