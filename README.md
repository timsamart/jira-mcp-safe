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

## Windows PowerShell setup

Persist the runtime variables once per Windows user profile:

```powershell
$vars = @{
  JIRA_BASE_URL = 'https://example.atlassian.net'
  JIRA_DEPLOYMENT = 'cloud' # use 'data_center' for Jira Server/Data Center
  JIRA_EMAIL = 'you@example.com' # cloud only
  JIRA_TOKEN = 'replace-at-runtime'
  JIRA_CONNECTION_ID = 'work'
  JIRA_ALLOWED_PROJECTS = 'APP,PLATFORM'
  JIRA_ALLOWED_WRITE_FIELDS = 'summary,description,assignee,priority,labels,duedate,components,fixVersions'
  JIRA_MAX_RESULTS = '50'
  JIRA_PLAN_TTL_SECONDS = '600'
}

foreach ($pair in $vars.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($pair.Key, $pair.Value, 'User')
}
```

Open a new PowerShell session after running that snippet so the new user variables are visible immediately.

## Deployment modes

| Mode | Base URL | Email | Token | Auth shape |
| --- | --- | --- | --- | --- |
| Cloud | `https://your-domain.atlassian.net` | required | Jira API token | Basic auth with email + token |
| Data Center | `https://jira.company.tld[/context]` | omit | Jira PAT | Bearer token |

`JIRA_DEPLOYMENT` switches the API paths and auth method. `JIRA_ALLOWED_PROJECTS` accepts a comma-separated allowlist or `*`, and `JIRA_ALLOWED_WRITE_FIELDS` defaults to the safe common-field set if you leave it unset.

## Codex and OpenCode

Codex users can keep using `examples/codex-config.toml` or copy the same server block into their local config.

OpenCode users should run the matching installer in each repo they want to expose:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-opencode.ps1
# Or, when PowerShell 7 is installed:
pwsh -File .\scripts\install-opencode.ps1
```

The script installs both parts of the integration:

- `jira_safe` is merged into the shared OpenCode MCP config.
- `manage-jira-safely` is copied to `~/.config/opencode/skills/` for global discovery.

Existing `opencode.json` and `opencode.jsonc` files are supported. The installer validates the update before touching either destination, preserves JSONC comments and unrelated settings, keeps permission rules in their security-sensitive order, writes through a verified temporary file, and creates a timestamped backup whenever it changes an existing config or skill. Re-running it with the same version is idempotent.

Pass `-ConfigPath` or `-SkillsPath` to override either destination. If both `opencode.json` and `opencode.jsonc` exist in the default directory, the installer refuses to guess; pass `-ConfigPath` explicitly.

The checked-in `examples/opencode.jsonc` remains available as a manual fallback, but it no longer needs hand-editing for the local path.

## Safety boundary

This is the local stdio profile. Plans and audit events are in memory and disappear on restart. Do not expose it as a multi-user remote service without durable tenant-bound storage, independent MCP authentication, and an external audit sink.
