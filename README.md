# FrontLit skills

Teach your AI coding agent to build your [FrontLit](https://frontlit.app) website and docs.

A **skill** is a set of instructions an AI agent (Claude Code, Codex, Cursor and others) reads before it starts a task. With these skills installed, you can ask your agent things like "move our docs to FrontLit" or "add a pricing page", and it follows FrontLit's rules. It checks its own work and opens a pull request for you to review. Nothing goes live until you merge.

| Skill | Use it to |
| --- | --- |
| [`frontlit-docs`](plugins/frontlit/skills/frontlit-docs/SKILL.md) | Write docs pages, or move an existing docs site (Fumadocs, Docusaurus, Mintlify, Nextra, GitBook, VitePress, plain Markdown) to FrontLit, including an API reference from an OpenAPI spec |
| [`frontlit-pages`](plugins/frontlit/skills/frontlit-pages/SKILL.md) | Create and design landing pages, set the header, footer and theme, change the site name or logo, and add embeds |

## Before you start

You need:

1. A FrontLit account and website.
2. An AI coding agent, such as Claude Code or Codex.
3. For docs, and for pages kept in Git: your GitHub repository connected to FrontLit. In FrontLit, open **Settings → Integrations** and connect GitHub. If the repository has no FrontLit folder yet, FrontLit opens a pull request that adds one. Merge it before you continue.

You can skip step 3 if you only want to edit pages in FrontLit's visual builder or change your branding.

## Install

Pick the command for your agent.

**Claude Code:**

```
/plugin marketplace add codelitdev/frontlit-skills
/plugin install frontlit@frontlit
```

Then type `/mcp`, choose **frontlit** and sign in. This connects the agent to your FrontLit account; see [Connect your FrontLit account](#connect-your-frontlit-account-optional).

**Codex:**

```bash
codex plugin marketplace add codelitdev/frontlit-skills
codex plugin add frontlit@frontlit
codex mcp login frontlit
```

**Any other agent** (Cursor, OpenCode, Gemini CLI, Copilot…):

```bash
npx skills add codelitdev/frontlit-skills
```

This installs the two skills only. To connect your FrontLit account as well, see [Connect your FrontLit account](#connect-your-frontlit-account-optional).

If you installed the older `frontlit-docs` or `frontlit-pages` plugins, uninstall them and install `frontlit` instead.

## Try it

Open your agent in your repository and ask in plain words. For example:

```
Use the frontlit-docs skill to move our docs to FrontLit and open a pull request.
Use the frontlit-docs skill to add a guide on webhooks.
Use the frontlit-pages skill to add a pricing page and link it from the header.
Use the frontlit-pages skill to redesign our homepage in the FrontLit builder, as a draft.
Use the frontlit-pages skill to set our website name to John's Piping Pizza.
```

What happens next:

1. The agent edits files in your repository's FrontLit folder (`frontlit/` by default): docs in `docs/`, pages in `pages/`, and the header, footer and theme in `site.json`.
2. It checks the files with the skill's own checker, then opens a pull request.
3. FrontLit checks the pull request too. If something is wrong, the check says what, and you can ask the agent to fix it.
4. You review and merge. FrontLit publishes the change.

Builder pages and branding changes don't go through Git: the agent makes them in FrontLit directly, which needs a connected account.

## Connect your FrontLit account (optional)

Everything in Git works without this. Connect your account when you want the agent to:

- edit pages in the visual builder,
- change your site name, subtitle or logo,
- see what's live, or why a FrontLit check failed.

The Claude Code and Codex plugins already include the connection; just sign in (`/mcp` in Claude Code, `codex mcp login frontlit` in Codex). Otherwise, add it yourself:

```bash
# Claude Code; then type /mcp to sign in
claude mcp add --transport http frontlit https://api.frontlit.app/mcp

# Codex
codex mcp add frontlit --url https://api.frontlit.app/mcp
codex mcp login frontlit
```

Other agents: add `https://api.frontlit.app/mcp` as a remote MCP server (Streamable HTTP) in their settings.

When you sign in, you pick which FrontLit team the agent can work on. No API keys are needed, and the plugin contains none. Installing it doesn't publish anything or grant access on its own.

## Good to know

- **Review before you merge.** Merging a pull request publishes it. A docs page with `published: false` stays a private draft.
- **Moving docs keeps your URLs.** The agent reuses your existing page addresses where it can and lists any that change in the pull request. Redirecting the old docs domain is up to you; the agent explains how.
- **Your old docs site stays put** until you've checked the new one and ask the agent to remove it.
- **An API reference publishes your whole OpenAPI spec,** even from a private repository. The agent tells you before it sets one up.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the skills stay in sync with FrontLit.
