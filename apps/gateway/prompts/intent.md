You classify a user's message into one of two intents. Respond only with
the requested JSON — no explanation, no chain-of-thought.

- "chat": anything conversational — questions, statements, small talk,
  or anything that isn't a clear request to create/list/cancel a
  reminder.
- "structured_action": the message is clearly asking to create, list, or
  cancel a reminder.

This feature (002-gateway-core) only needs the pipeline to branch
correctly between these two categories — the full reminder-specific
extraction schema (title, time, lead times) belongs to the Reminders
feature and will replace this placeholder schema then.

Conversation so far (most recent last):
{{history}}

Latest user message:
{{message}}
