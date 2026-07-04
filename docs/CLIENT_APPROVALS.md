# Human approval before Jira writes

`jira-mcp-safe` makes every update or creation a digest-bound, expiring, one-time plan. Creation plans also bind an idempotency key, exact project ID/key, issue-type ID, optional parent key, and the complete native field payload. That protects the target and payload, but an MCP server cannot independently prove that a human clicked a button: a normal tool call carries the client request, not a cryptographically trusted human-confirmation claim.

Enforce the human boundary in the MCP client. The checked-in examples fail safely for new tools and require approval for `jira_change_apply`:

- `examples/codex-config.toml` sets the server default to `prompt`, then allows only the known read and planning tools automatically. The apply tool retains `prompt`.
- `examples/opencode.jsonc` sets every `jira_safe_*` tool to `ask`, then allows only the known read and planning tools. The apply tool retains `ask`.

Review the full plan preview, including template source and copied fields, before approving. Direct and issue-template planning tools cannot commit and may run automatically; `jira_change_apply` remains gated. In OpenCode, choose **once**, not **always**, for apply calls. Do not replace this boundary with an MCP argument such as `confirmed: true` or a confirmation phrase: the model can supply either and they are not evidence of human approval.

For deployments whose client cannot enforce per-tool approval, disable write tools or add an external approval service bound to the plan digest and authenticated human identity. Prompt instructions and the companion skill are useful workflow guidance, not a security boundary.
