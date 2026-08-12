# Assist Conversation Display

This context covers capturing Home Assistant Assist conversations and presenting them on room-local dashboard surfaces.

## Language

**Assist Satellite**:
A Home Assistant voice assistant entity, typically `assist_satellite.*`, that represents the room or device through which a user speaks to Assist.
_Avoid_: Voice assistant entity, satellite device

**Displayed Conversation**:
The ordered user and assistant turns shown for one selected Assist Satellite.
_Avoid_: Chat log, debug log, message feed

**Streaming Displayed Conversation**:
A Displayed Conversation that updates an in-flight assistant turn from Assist progress events before replacing it with the final assistant text when the turn completes.
_Avoid_: Final transcript, completed-only conversation

**Assist Transcript Broker**:
The backend part of this project that normalizes Assist conversation activity and makes it available to consumers.
_Avoid_: Card integration, dashboard backend

**Transcript Consumer**:
Any Home Assistant surface, automation, or external client that reads a Displayed Conversation for a selected Assist Satellite.
_Avoid_: Card, widget

**Browser Transcript Cache**:
The frontend-only memory held by a Transcript Consumer for the Displayed Conversation it has observed during the current browser session.
_Avoid_: Global cache, persistent transcript store

**Message Max Age**:
A Transcript Consumer policy that hides each Transcript Message once the message's own latest known activity is older than the configured age. A disabled Message Max Age leaves observed messages visible until another policy removes them.
_Avoid_: Snapshot freshness, inactivity clear, transcript retention

**Recent Transcript Snapshot**:
A best-effort view of Displayed Conversation data that can still be reconstructed from Home Assistant's current in-memory Assist debug runs.
_Avoid_: Transcript history, archived conversation

**Transcript Message**:
A normalized message object in a Displayed Conversation, owned by either the user, the assistant, or the integration when showing a compact error.
_Avoid_: Raw pipeline event, HA debug event

**Transcript Delta**:
A normalized update that adds, updates, replaces, or finalizes a Transcript Message after a Transcript Consumer has received its initial Recent Transcript Snapshot.
_Avoid_: Debug event, pipeline callback

**Unattributed Assist Run**:
An Assist pipeline run whose debug events do not identify the originating Assist Satellite.
_Avoid_: Unknown room conversation, guessed satellite run

**Listening Placeholder**:
A temporary user-side bubble shown while an Assist Satellite is listening, replaced by transcribed text when speech-to-text completes.
_Avoid_: Partial transcription, fake transcript

**In-Flight Assistant Bubble**:
The assistant-side bubble currently being updated by Assist progress events before the final response is known.
_Avoid_: Streaming message, partial answer

**Assistant Activity Indicator**:
A compact assistant-side visual state shown when an Assist run is active but no visible assistant response text has arrived yet.
_Avoid_: Empty assistant bubble, thinking content

**Run Boundary**:
A subtle marker where one Assist pipeline run ends and another begins inside a Displayed Conversation.
_Avoid_: Conversation reset, session break

**Assist Error Bubble**:
A compact assistant-side bubble that tells the user an Assist run failed, with technical details hidden unless expanded.
_Avoid_: Exception dump, failed transcript

**Unsupported Assist Transcript State**:
A card state shown when the installed Home Assistant version or runtime does not expose enough Assist debug data for this project to build a Displayed Conversation.
_Avoid_: Empty transcript, stale transcript

**Display Scale**:
A configurable visual scale factor for a Transcript Consumer's Displayed Conversation. It enlarges or shrinks the conversation's text, bubbles, spacing, and activity indicators without changing transcript data or Home Assistant dashboard layout.
_Avoid_: Browser zoom, font size, card size

**Card Height Policy**:
The Transcript Consumer setting that determines whether the dashboard controls card height, the card fills the remaining viewport from its current top edge, or the user supplies a custom CSS height.
_Avoid_: Panel detection, section sizing, browser viewport hack
