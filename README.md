# Assist Chat Display

Assist Chat Display is a Home Assistant custom integration with a bundled dashboard card.

It shows the current conversation of one selected `assist_satellite.*` entity as chat bubbles on a dashboard. The intended use case is a wall tablet or smart display in the same room as a voice satellite, so spoken Assist interactions are also visible on the screen.

## Features

- Dashboard card bundled with the integration: `custom:assist-chat-display-card`
- Live user and assistant bubbles for one Assist Satellite supporting streaming.
- Colors are customizable through CSS variables
- An additional Home Assistant action to fetch the currently available messages for automations and scripts

On Home Assistant `2026.6` and newer, the card can be suggested automatically when adding a card for an `assist_satellite.*` entity.

## Installation

### HACS

Add this repository to HACS as a custom repository of type **Integration**, then install it and restart Home Assistant:

```text
https://github.com/Thyraz/assist-chat-display
```

After restart, add the **Assist Chat Display** integration under:

```text
Settings -> Devices & services -> Add integration
```

For normal UI-managed dashboards, the dashboard card resource is registered automatically. YAML dashboards need the resource added manually:

```yaml
resources:
  - url: /assist_chat_display/assist-chat-display-card.js?v=1.0.0
    type: module
```

### Manual Test Install

Copy `custom_components/assist_chat_display` into your Home Assistant `custom_components` folder, restart Home Assistant, then add the integration from the UI.

## Dashboard Card

Example card config:

```yaml
type: custom:assist-chat-display-card
entity: assist_satellite.living_room
max_messages: 20
max_initial_age: 300
clear_after: 0
show_header: false
```

Options:

| Option | Default | Description |
| --- | ---: | --- |
| `entity` | required | The `assist_satellite.*` entity whose conversation should be displayed. |
| `max_messages` | `20` | Maximum number of bubbles kept in the browser. |
| `max_initial_age` | `300` | Ignore older messages when the card loads, in seconds. |
| `clear_after` | `0` | Clear the card after inactivity, in seconds. `0` disables auto-clear. |
| `show_header` | `false` | Show the selected satellite name above the bubbles. |

## Action

The integration also provides the `assist_chat_display.get_transcript` action.

Use it when you want to fetch the currently available messages for a selected Assist Satellite outside the bundled card, for example in an automation or script.

```yaml
action: assist_chat_display.get_transcript
data:
  assist_satellite_entity: assist_satellite.living_room
response_variable: transcript
```

The response contains the selected satellite and a `messages` array with user and assistant messages. This is not permanent history; it only reflects what Home Assistant still has available in memory.

## Styling

The card background is transparent so it inherits the dashboard or section background. Bubble colors can be changed through theme CSS variables or tools such as uix (card-mod successor).

Common variables:

```css
--assist-chat-display-user-bubble-background: var(--blue-color);
--assist-chat-display-assistant-bubble-background: var(--green-color);
--assist-chat-display-user-bubble-color: #ffffff;
--assist-chat-display-assistant-bubble-color: #ffffff;
--assist-chat-display-error-bubble-background: var(--error-color);
--assist-chat-display-radius: 20px;
--assist-chat-display-font-size: 16px;
```

## Limits

- The integration does not store transcript history.
- Messages can disappear after a Home Assistant restart or when Home Assistant no longer keeps older Assist activity available.
- Thinking and tool details are captured internally but are not (yet) shown in the card.

## Development Notes

The deeper design notes and Home Assistant source assumptions are in `docs/`.
