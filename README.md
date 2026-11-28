# FrontLit skills

Teach your AI coding agent to build your [FrontLit](https://frontlit.app) website and docs.

A **skill** is a set of instructions an AI agent (Claude Code, Codex, Cursor and others) reads before it starts a task. With these skills installed, you can ask your agent things like "move our docs to FrontLit" or "add a pricing page", and it follows FrontLit's rules. It checks its own work and opens a pull request for you to review. Nothing goes live until you merge.

| Skill | Use it to |
| --- | --- |
| [`frontlit-docs`](plugins/frontlit/skills/frontlit-docs/SKILL.md) | Write docs pages, or move an existing docs site (Fumadocs, Docusaurus, Mintlify, Nextra, GitBook, VitePress, plain Markdown) to FrontLit, including an API reference from an OpenAPI spec |
| [`frontlit-pages`](plugins/frontlit/skills/frontlit-pages/SKILL.md) | Create and design landing pages, set the header, footer and theme, change the site name or logo, and add embeds |
| [`frontlit-articles`](plugins/frontlit/skills/frontlit-articles/SKILL.md) | Write, edit and publish blog posts, with a clean slug, excerpt, featured image and SEO (needs a connected FrontLit account) |

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

This installs the skills only. To connect your FrontLit account as well, see [Connect your FrontLit account](#connect-your-frontlit-account-optional).

Run inside a repository, this command adds three things to it: the skills in `.agents/skills/`, links to them for your agent (such as `.claude/skills/`), and `skills-lock.json`, which records the installed version. Either:

- **Commit them** so everyone on the team, and CI, uses the same version. `npx skills update` moves to the latest. If the repository runs a formatter or linter over all files, add `.agents/skills/` to its ignore list.
- **Or keep them out of the repository:** install with `npx skills add -g codelitdev/frontlit-skills` instead, which installs for your user only. If you already installed into the repository, add `.agents/skills/`, `.claude/skills/` and `skills-lock.json` to `.gitignore` (not all of `.claude/`, which may hold shared settings).

The plugins for Claude Code and Codex add nothing to the repository.

### Updating

Plugins don't update themselves. An old install checks your files against old rules and can report errors that aren't real. The checkers print their plugin version (`OK: … (FrontLit plugin 0.6.0)`), so compare it with the [latest release](plugins/frontlit/.claude-plugin/plugin.json).

**Claude Code:**

```bash
claude plugin marketplace update frontlit
claude plugin update frontlit@frontlit
```

Then restart Claude Code.

**Codex:**

```bash
codex plugin marketplace upgrade frontlit
```

Then start a new Codex session. If the checkers still print the old version, reinstall: `codex plugin remove frontlit@frontlit`, then `codex plugin add frontlit@frontlit`.

**`npx skills`:** run `npx skills update`.

If you installed the older `frontlit-docs` or `frontlit-pages` plugins, uninstall them and install `frontlit` instead.

## Try it

Open your agent in your repository and ask in plain words. For example:

```
Use the frontlit-docs skill to move our docs to FrontLit and open a pull request.
Use the frontlit-docs skill to add a guide on webhooks.
Use the frontlit-pages skill to add a pricing page and link it from the header.
Use the frontlit-pages skill to redesign our homepage in the FrontLit builder, as a draft.
Use the frontlit-pages skill to set our website name to John's Piping Pizza.
Use the frontlit-articles skill to draft a blog post on our new webhooks feature.
Use the frontlit-articles skill to add a featured image to our latest post and publish it.
```

What happens next:

1. The agent edits files in your repository's FrontLit folder (`frontlit/` by default): docs in `docs/`, pages in `pages/`, and the header, footer and theme in `site.json`.
2. It checks the files with the skill's own checker, then opens a pull request.
3. FrontLit checks the pull request too. If something is wrong, the check says what, and you can ask the agent to fix it.
4. You review and merge. FrontLit publishes the change.

Builder pages, blog posts and branding changes don't go through Git: the agent makes them in FrontLit directly, which needs a connected account. Blog posts stay drafts until you ask the agent to publish them.

## Connect your FrontLit account (optional)

Everything in Git works without this. Connect your account when you want the agent to:

- edit pages in the visual builder,
- write and publish blog posts,
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
- **Moving docs keeps your URLs.** The agent reuses your existing page addresses where it can and lists any that change in the pull request. It also works out how to redirect your old docs address and puts that plan in the pull request. You add the redirect in FrontLit and update DNS when you're ready, and the agent can then check that every old link lands on the right page.
- **Your old docs site stays put** until you've checked the new one and ask the agent to remove it.
- **An API reference publishes your whole OpenAPI spec,** even from a private repository. The agent checks the spec first, tells you what to fix, and tells you before it sets one up.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the skills stay in sync with FrontLit.
