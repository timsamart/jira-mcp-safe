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

OpenCode users should run the matching installer in each repo they want to expose after the first build:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\install-opencode.ps1
```

The script builds `dist/src/index.js` if it is missing, then merges a `jira_safe` entry into the shared OpenCode config at `~/.config/opencode/opencode.json`. It keeps unrelated settings intact and points OpenCode at this checkout through the env vars you set above.
Pass `-ConfigPath` if your OpenCode config lives somewhere else.

The checked-in `examples/opencode.jsonc` remains available as a manual fallback, but it no longer needs hand-editing for the local path.

## Safety boundary

This is the local stdio profile. Plans and audit events are in memory and disappear on restart. Do not expose it as a multi-user remote service without durable tenant-bound storage, independent MCP authentication, and an external audit sink.
