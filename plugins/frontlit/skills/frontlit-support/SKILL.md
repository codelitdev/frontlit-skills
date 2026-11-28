---
name: frontlit-support
description: >-
  Add FrontLit's in-app support chat to a SaaS product's codebase: a server route that starts a support session with the signed-in user, their account and what just failed, the chat snippet, and Help / Contact support buttons wired to the app's own error handling. Use when the user wants customers to reach support from inside their app, wants errors or context attached to support chats, or asks to embed the FrontLit chat or chatbot in their product. Not for the FrontLit website or docs (use frontlit-pages or frontlit-docs).
---

# FrontLit in-app support

FrontLit's chat can live inside the customer's own product. When a signed-in user clicks **Help** or **Contact support**, the conversation reaches the team's FrontLit inbox already knowing who they are, which account they belong to, and what just failed. When an error comes with the chat and the team's docs don't explain it, FrontLit's AI hands the chat to a person straight away instead of guessing.

Your job is to add this to the user's codebase so it is secure, uses what the app already knows, and passes review on the first try.

The integration guide is the source of truth for the API, fields and snippet: https://frontlit.app/docs/developers/in-app-support (also served as Markdown at `https://frontlit.app/docs/developers/in-app-support.md`). **Read it before writing code**; this skill covers how to fit it into an existing app, not the API details.

Read these as needed:

- `references/recipes.md`: the server route and button for common stacks (Next.js, Express, Rails, Django, Laravel). **Read before writing the route.**
- `references/mcp.md`: using a connected FrontLit account to check the chatbot, create the key and try a session. **Read before any MCP call.**

## The three pieces

1. **A server route** in the user's backend, e.g. `POST /api/support-session`. It reads the signed-in user from the app's own session, calls `POST https://api.frontlit.app/support-sessions` with a **Support sessions only** API key, and returns the `token`.
2. **The chat snippet**, once in the app's root layout, with `launcher: false` when the app has its own button.
3. **Buttons** that call the route on click and then `FrontLit.open({ token })`: a general **Help**, and **Contact support** next to errors the app already shows.

## Rules that matter

- **The API key never reaches the browser.** It goes in a server-side environment variable (`FRONTLIT_SUPPORT_KEY`), read only by the route. Never in client code, a `NEXT_PUBLIC_`/`VITE_` variable, a committed file or a log line.
- **Identity comes from the server session, not the request.** The route ignores any user details the browser sends; it uses the app's authenticated user. An unauthenticated request gets 401 and no session.
- **Start a session on click, not on page load.** Tokens last about an hour and must not be cached or reused across users. A session creates no ticket until the user sends a message, so clicking is free.
- **Use a Support sessions only key**, never a full API key: it can start sessions and nothing else.
- **`context` is for support, not secrets.** Send the page, the error message, a request or trace ID and the app version. Never send passwords, tokens, cookies, full request bodies, card data or other users' data. It's limited to 8 KB and shown to the team as plain text.
- **Errors go in `context.error`, in plain words** ("Image upload failed: 413"), not stack traces. This is what lets FrontLit's AI hand an unexplained error to a person.
- **`message` is in the user's words** ("I can't upload an image"). It prefills the chat box; the user still decides to send it.
- **Close the chat on logout** with `FrontLit.close()`, so the next person on the same browser doesn't see it.

## 1. Understand the app

1. Find the stack: framework, server language, where routes live, how the root layout or HTML shell is rendered.
2. Find the signed-in user: the session or auth helper (`auth()`, `getServerSession`, `current_user`, `request.user`, `Auth::user()`…) and which fields exist for email, name and user ID.
3. Find the **account** concept, if any: the workspace, organization, school or project a user belongs to. Pass its ID, name and an admin URL so the team can jump to it.
4. Find how the app surfaces errors: error boundaries, toast or alert helpers, a fetch/API client wrapper, error pages. These are where **Contact support** belongs.
5. Check for an existing support widget (Intercom, Crisp, a mailto link). Ask the user whether FrontLit replaces it before removing anything.

## 2. Set up FrontLit

The user needs, from FrontLit:

- The **team ID** (`team_...`), shown on the **Teams** page.
- The chatbot turned on (**Website → Chatbot**).
- A **Support sessions only** API key (**Teams → Manage API keys**).

With a connected FrontLit account you can check and create these yourself; see `references/mcp.md`, and ask before creating a key. Otherwise ask the user for the team ID and to create the key. Either way, put the key in the app's local, gitignored env file and in `.env.example` (as an empty placeholder), and tell the user to add it to their production environment. Don't print the key in chat or commit it.

## 3. Write the code

Follow `references/recipes.md` for the stack, and match the app's existing conventions (route style, fetch helper, component library, error handling).

1. **Route:** authenticate, build the body from the session user and the account, take only `page`, `error`, `requestId` and `message` from the request body (validate their types and lengths), call FrontLit, return `{ token }`. On a FrontLit error, log the status (not the key) and return a generic 502.
2. **Snippet:** add it once to the root layout or HTML shell, loaded `async`. Use the team ID from config, not hard-coded in several places.
3. **Help button:** in the app's header, help menu or sidebar, using the app's own button component. No error in `context`.
4. **Contact support on errors:** add it to the app's error UI. Pass the error text, the current path and any request ID the app already has. Start with the main error boundary or toast helper; don't add buttons to every error site.
5. **Unread count (optional):** if the app has its own Help button, show unread replies on it with `FrontLit.push("onUnreadCountChange", (count) => …)`.
6. **Logout:** call `FrontLit.close()` where the app signs the user out.

## 4. Check, then open a pull request

1. Run the app's type check, linter and tests.
2. Confirm the key appears only in the route and env files: search the client code and build output for `FRONTLIT_SUPPORT_KEY` and `x-frontlit-apikey`.
3. Confirm the route returns 401 when signed out.
4. If you can run the app: sign in, click Help, and check that the chat opens. With MCP connected, `create_support_session` can also check the API key and team setup without a browser.
5. Open a pull request. In its description, list the env variable to add in production, where the buttons are, and what goes in `context`. Mention that tickets appear in the FrontLit inbox only once a user sends a message.

Common failures: `POST /support-sessions` returns 401 for a missing or wrong key and 400 when `context` is over 8 KB. If the chatbot is off, the session still starts but the chat won't open (the widget gets 403 "Chatbot is not enabled for this team"); turn it on under **Website → Chatbot**.
