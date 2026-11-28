# FrontLit MCP for in-app support

Discover available tools and inspect their current schemas first; clients may prefix their names. MCP is optional: without it, ask the user for the team ID and to create the key in FrontLit, and write the code anyway.

## Pick the team

`list_teams({})` returns every team the account can reach. Use the team the user names; ask when there is more than one and it's unclear. Pass its `teamId` to the calls below. The same ID goes in the snippet's `init`.

## Check the chatbot

`get_chatbot_settings({ teamId })` returns `enabled`. The chat won't open while it's `false`. Turning it on (`update_chatbot_settings({ teamId, enabled: true })`) also shows FrontLit's chat on the team's FrontLit website, so ask first, or tell the user to switch it on under **Website → Chatbot**.

## Create the key (ask first)

`create_api_key({ teamId, name: "<app name> support sessions", scope: "support:sessions" })` returns the secret **once**.

- Always pass `scope: "support:sessions"`. A full key can read and change the inbox; this one can only start sessions.
- Write the secret straight into the app's local, gitignored env file as `FRONTLIT_SUPPORT_KEY`. Don't echo it in chat, a commit, the pull request or a log.
- Tell the user to add the same variable to production, or to create a separate key for production under **Teams → Manage API keys** (keys can be revoked there).
- Check `list_api_keys({ teamId })` first: if a support-sessions key for this app already exists, ask whether to reuse it (the user must supply its value) or create a new one.

## Try a session without the app

`create_support_session({ teamId, contact: { email, name, externalId }, account, context, message })` makes the same call as the route and returns `{ token, url, expiresAt }`. Use it to confirm the team and chatbot are set up before the app runs, or to show the user the payload. Opening `url` shows the chat for that contact. It creates no ticket until a message is sent; don't send messages as a real customer.

## AI auto-reply (only if asked)

`get_inbox_ai_settings({ teamId })` shows whether the AI answers chats (`channels.chatbot.autoReply`) and whether the team has an AI provider (`aiConfigured`). With auto-reply on, a chat whose `context.error` the team's published docs don't explain is handed to a person straight away. Don't change these settings as part of the integration unless the user asks.
