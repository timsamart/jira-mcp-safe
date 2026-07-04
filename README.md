# jira-mcp-safe

A runnable, local-first MCP server for bounded Jira reads and preview-before-apply issue updates. It supports Jira Cloud API tokens and Jira Data Center PATs, enforces an optional project allowlist, pins all requests to one origin, and never accepts credentials through MCP tool arguments.

## Quick start

```bash
npm install
npm run build
JIRA_BASE_URL=https://example.atlassian.net \
JIRA_DEPLOYMENT=cloud JIRA_EMAIL=you@example.com JIRA_TOKEN=... \
JIRA_ALLOWED_PROJECTS=APP JIRA_ALLOWED_WRITE_FIELDS=summary,labels \
node dist/src/index.js
```

Copy `.env.example` into your secret-injection system; this project intentionally does not load `.env` files itself. Configure an MCP client to launch `node /absolute/path/to/dist/src/index.js` with the variables in its environment.

## Codex and OpenCode

After building, copy the matching file from `examples/` into your client configuration and replace its checked-in absolute server path with this checkout's `dist/src/index.js`. To install the workflow skill for either client, copy `skills/manage-jira-safely` to the shared user location `$HOME/.agents/skills/manage-jira-safely` (or to `.agents/skills/manage-jira-safely` in a target repository). Restart the client if the skill is not discovered immediately.

The examples allow reads and planning tools but leave `jira_change_apply` behind a one-time UI prompt. That apply tool also advertises `destructiveHint: true`; do not weaken the wildcard/default prompt rule.

The MVP exposes identity, capabilities, allowed projects, bounded issue search/read, transitions, native create-schema discovery, metadata-validated direct or issue-as-template creation, exact updates, idempotent creation planning, and one-time verified apply. Ticket templates copy only explicitly selected fields from an exact source issue version; Jira has no generic native issue-template REST entity. Use the checked-in Codex/OpenCode examples to require a real UI approval before apply; see [client approvals](docs/CLIENT_APPROVALS.md), [architecture](docs/ARCHITECTURE.md), the [product concept](CONCEPT.md), and the [full proposed catalog](docs/TOOL_CATALOG.md).

## Safety boundary

This is the local stdio profile. Plans and audit events are in memory and disappear on restart. Do not expose it as a multi-user remote service without durable tenant-bound storage, independent MCP authentication, and an external audit sink.
