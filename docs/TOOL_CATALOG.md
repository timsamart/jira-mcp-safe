# Proposed MCP tool catalog

## Contract rules

This catalog names **logical capabilities**, not Jira REST endpoints. A query capability maps to one read-only MCP tool. A mutation capability maps to a side-effect-free planning tool plus one of a small number of apply tools.

Physical mutation pattern:

```text
jira_issue_update_plan(...) -> Plan
jira_change_apply(plan_id, digest) -> ChangeResult
```

For bulk and administrative changes, use `jira_bulk_change_apply` and `jira_admin_change_apply` so clients can attach stricter controls and MCP annotations. Apply tools accept only a valid server plan; they never accept raw Jira payloads.

Most personal-token connection profiles bind one Jira site, so tools omit `site_id` when the connection is unambiguous. Multi-connection sessions take an explicit `connection_id`; never let a token-backed tool choose a site from issue text. IDs use strings even when Jira currently represents them as numbers. Search/list tools use server cursors and explicit field sets.

Release tiers:

- **P0:** required to prove the architecture.
- **P1:** safe issue-work MVP.
- **P2:** complete team and service workflows.
- **P3:** advanced or administrative surface, separately enabled.

The catalog is divided into capability groups. Deployments enable groups, and the server advertises only tools supported by the Jira products, adapter, identity, and policy. Do not expose every tool at once: a typical `core_read + core_write` session should remain in the 15–30 tool range. Keep tool discovery stable for the session unless the MCP client supports tool-list change notifications. Hiding a tool improves model selection but is never a substitute for call-time authorization.

## Recommended first shippable surface

The first production slice should expose no more than these 30 tools. This is enough for high-quality everyday issue work while proving identity, metadata discovery, bounded reads, planning, application, and verification:

```text
jira_capabilities_get           jira_sites_list
jira_identity_get               jira_permissions_check
jira_projects_list              jira_project_get
jira_issue_types_list           jira_fields_list
jira_field_resolve              jira_users_search
jira_link_types_list            jira_jql_validate
jira_issue_search               jira_issue_count
jira_issue_get                  jira_issues_get
jira_issue_history_get          jira_issue_transitions_list
jira_issue_create_schema_get    jira_issue_edit_schema_get
jira_comments_list              jira_worklogs_list
jira_issue_create_plan          jira_issue_update_plan
jira_issue_transition_plan      jira_issue_assign_plan
jira_issue_link_plan            jira_comment_add_plan
jira_worklog_add_plan           jira_change_apply
```

Ship attachments, bulk, Agile, JSM, releases, and admin reads as subsequent capability groups. This ordering lets the safety architecture mature before expanding the blast radius.

## Foundation and discovery

| Tool | Tier | Purpose |
|---|---:|---|
| `jira_capabilities_get` | P0 | Server, adapter, Jira product/version, tool, policy, and limit capabilities with reason codes. |
| `jira_sites_list` | P0 | Jira sites available to the bound identity. |
| `jira_identity_get` | P0 | Current MCP and Jira principal, timezone, locale, token kind, and safe detected capabilities. |
| `jira_server_info_get` | P0 | Deployment type, version, base URL label, product modules, and safe system metadata. |
| `jira_permissions_check` | P0 | Effective permissions in global, project, or issue context. |
| `jira_projects_list` | P0 | Visible projects with bounded filtering. |
| `jira_project_get` | P0 | Project metadata, lead, type, category, and enabled features. |
| `jira_issue_types_list` | P0 | Issue types globally or for a project. |
| `jira_fields_list` | P0 | Fields with stable IDs, schemas, contexts, and policy visibility. |
| `jira_field_resolve` | P0 | Resolve a human field name with ambiguity reporting; never guess duplicates. |
| `jira_users_search` | P1 | Bounded user/account lookup with privacy-aware output. |
| `jira_groups_search` | P3 | Restricted group lookup for administrative workflows. |
| `jira_priorities_list` | P1 | Available priorities. |
| `jira_resolutions_list` | P1 | Available resolutions for interpretation; transitions still control setting. |
| `jira_statuses_list` | P1 | Status and status-category metadata. |
| `jira_link_types_list` | P1 | Issue link types and inward/outward labels. |

## Query and analysis

| Tool | Tier | Purpose |
|---|---:|---|
| `jira_jql_validate` | P0 | Parse, validate, policy-check, and estimate a JQL query without running it. |
| `jira_issue_search` | P0 | Bounded structured-filter or JQL search with explicit fields and cursor. |
| `jira_issue_count` | P0 | Count a policy-bounded selection without returning issue content. |
| `jira_issue_get` | P0 | Get one issue with explicit fields/expansions and trust labels. |
| `jira_issues_get` | P1 | Get a bounded explicit set of issue IDs/keys. |
| `jira_issue_history_get` | P1 | Bounded changelog, optionally filtered by field IDs. |
| `jira_issue_transitions_list` | P0 | Currently available transitions and required transition fields. |
| `jira_issue_create_schema_get` | P0 | Required and allowed fields for project plus issue type. |
| `jira_issue_edit_schema_get` | P0 | Editable fields and operations for the current issue. |
| `jira_issue_links_list` | P1 | Local and remote issue links. |
| `jira_issue_watchers_list` | P2 | Watchers when permitted. |
| `jira_issue_properties_list` | P3 | Property keys/selected values, policy restricted. |

Do not add an open-ended analytics engine in v1. Status, release, stale-work, and workload reports should initially compose bounded searches and counts. Add dedicated aggregate tools only where they reduce data exposure or API cost.

## Issue lifecycle mutations

Each row below represents a `*_plan` tool. Execution uses `jira_change_apply`, except bulk and admin plans.

| Logical tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_issue_create_plan` | P1 | R2 | Create one issue or subtask using current create metadata. |
| `jira_issue_create_from_issue_plan` | P1 | R2 | Create from an exact source issue using an explicit copied-field allowlist and overrides. |
| `jira_issues_create_plan` | P2 | R3 | Create a bounded set with per-item validation and idempotency. |
| `jira_issue_update_plan` | P1 | R2 | Patch specified fields; preserve all unspecified content. |
| `jira_issue_transition_plan` | P1 | R2/R3 | Run an available transition with required fields. |
| `jira_issue_assign_plan` | P1 | R2 | Explicit assignment/unassignment with resolved account identity. |
| `jira_issue_link_plan` | P1 | R2 | Create a typed directional issue link. |
| `jira_issue_unlink_plan` | P2 | R2 | Delete a specific link, not an inferred relationship. |
| `jira_issue_move_plan` | P2 | R3 | Move project/type with field and workflow mapping shown. |
| `jira_issue_archive_plan` | P2 | R3 | Archive or restore where supported. |
| `jira_issue_delete_plan` | P3 | R4 | Permanently delete; disabled by default and never part of core profile. |

Do not create an unrestricted server-side clone primitive. `jira_issue_create_from_issue_plan` accepts only an explicit field-ID allowlist, validates the result against target create metadata, and binds the source issue version. This avoids copying hidden, sensitive, or invalid fields.

## Collaboration and content

| Tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_comments_list` | P1 | R1 | Bounded comments with visibility and trust labels. |
| `jira_comment_add_plan` | P1 | R2 | Add a Jira or JSM comment with explicit visibility. |
| `jira_comment_update_plan` | P2 | R2 | Edit an authored/permitted comment with an exact diff. |
| `jira_comment_delete_plan` | P3 | R4 | Delete a comment; disabled by default. |
| `jira_worklogs_list` | P1 | R1 | Bounded worklogs and time-spent metadata. |
| `jira_worklog_add_plan` | P1 | R2 | Add work with date/timezone, duration, and visibility. |
| `jira_worklog_update_plan` | P2 | R2 | Update a permitted worklog. |
| `jira_worklog_delete_plan` | P3 | R4 | Delete a worklog; disabled by default. |
| `jira_attachments_list` | P1 | R1 | Metadata only by default. |
| `jira_attachment_get` | P2 | R1/R2 | Download bounded, scanned content with explicit policy approval. |
| `jira_attachment_upload_plan` | P2 | R2 | Upload a local/client-provided file after type, size, malware, and DLP checks. |
| `jira_attachment_delete_plan` | P3 | R4 | Delete an attachment; disabled by default. |
| `jira_watcher_add_plan` | P2 | R2 | Add self or another permitted watcher. |
| `jira_watcher_remove_plan` | P2 | R2 | Remove a watcher. |
| `jira_vote_add_plan` | P3 | R2 | Add the current user's vote where supported. |
| `jira_vote_remove_plan` | P3 | R2 | Remove the current user's vote. |

Attachment upload input must use an MCP-supported content handoff or an allowed client root. The server must not accept arbitrary filesystem paths in remote mode or fetch an arbitrary URL.

## Bulk operations

| Tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_selection_plan` | P2 | R1 | Resolve JQL/filters to a frozen, expiring set of issue IDs and versions. |
| `jira_bulk_update_plan` | P2 | R3 | Patch allowed fields across a frozen selection. |
| `jira_bulk_transition_plan` | P2 | R3 | Group targets by valid transition and expose exceptions. |
| `jira_bulk_move_plan` | P3 | R3 | Move a frozen set with mapping and exception details. |
| `jira_bulk_watch_plan` | P2 | R3 | Watch/unwatch a frozen set. |
| `jira_bulk_archive_plan` | P3 | R3 | Archive/restore a frozen set. |
| `jira_bulk_delete_plan` | P3 | R4 | Permanently delete a frozen set; disabled by default. |
| `jira_job_get` | P2 | R1 | Poll asynchronous Jira/server bulk work. |
| `jira_job_cancel_plan` | P3 | R3 | Cancel a cancellable job. |

Bulk limits apply after policy intersection. Plans report excluded, inaccessible, stale, invalid, and no-op targets separately.

## Project planning and releases

| Tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_components_list` | P1 | R1 | Project components and leads. |
| `jira_component_create_plan` | P2 | R2 | Create a component. |
| `jira_component_update_plan` | P2 | R2 | Update a component. |
| `jira_component_delete_plan` | P3 | R4 | Delete/replace a component with impact shown. |
| `jira_versions_list` | P1 | R1 | Project versions/releases. |
| `jira_version_get` | P1 | R1 | Version metadata and bounded issue counts. |
| `jira_version_create_plan` | P2 | R2 | Create a version. |
| `jira_version_update_plan` | P2 | R2 | Rename, schedule, release, or unrelease a version. |
| `jira_version_move_plan` | P3 | R3 | Reorder a version. |
| `jira_version_merge_plan` | P3 | R3 | Merge versions with affected issue count. |
| `jira_version_delete_plan` | P3 | R4 | Delete with fix/affects replacement decisions. |
| `jira_project_roles_get` | P2 | R1 | Read project roles and actors, policy restricted. |

## Jira Software / Agile

Only expose these tools when Jira Software is present.

| Tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_boards_list` | P2 | R1 | Visible boards with project/filter association and type. |
| `jira_board_get` | P2 | R1 | Board configuration safe subset. |
| `jira_board_issues_list` | P2 | R1 | Bounded issues in board order. |
| `jira_backlog_issues_list` | P2 | R1 | Bounded backlog. |
| `jira_sprints_list` | P2 | R1 | Board sprints by state. |
| `jira_sprint_get` | P2 | R1 | Sprint details and bounded issue counts. |
| `jira_sprint_issues_list` | P2 | R1 | Bounded sprint issues. |
| `jira_sprint_create_plan` | P2 | R2 | Create a future sprint. |
| `jira_sprint_update_plan` | P2 | R2 | Change name, goal, or dates. |
| `jira_sprint_start_plan` | P2 | R3 | Start after showing dates, scope, and conflicts. |
| `jira_sprint_close_plan` | P2 | R3 | Close after showing incomplete issues and destination. |
| `jira_sprint_delete_plan` | P3 | R4 | Delete a future sprint; disabled by default. |
| `jira_issues_move_to_sprint_plan` | P2 | R3 | Move a frozen issue selection to sprint/backlog. |
| `jira_issue_estimate_plan` | P2 | R2 | Set the board's configured estimation field. |
| `jira_issues_rank_plan` | P2 | R3 | Rank a bounded ordered set before/after an anchor. |

Do not add separate epic tools unless the connected Jira version requires them. Prefer the instance's hierarchy and parent-field semantics discovered through metadata.

## Jira Service Management

Expose request/customer tools only when JSM is present and the identity has the appropriate customer, agent, or service-desk permission. Keep Operations alerts/on-call as a later, separate capability group because their identity and API model differ.

| Tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_service_desks_list` | P2 | R1 | Accessible service projects/desks. |
| `jira_request_types_list` | P2 | R1 | Request types for a service desk. |
| `jira_request_create_schema_get` | P2 | R1 | Required request fields and allowed values. |
| `jira_requests_search` | P2 | R1 | Bounded customer/agent request search. |
| `jira_request_get` | P2 | R1 | Request details with customer-visible semantics. |
| `jira_request_create_plan` | P2 | R2 | Create a request as the permitted identity. |
| `jira_request_comments_list` | P2 | R1 | Public/internal comments according to role. |
| `jira_request_comment_add_plan` | P2 | R2 | Add comment with mandatory `visibility: public|internal`. |
| `jira_request_participants_list` | P2 | R1 | Request participants. |
| `jira_request_participant_add_plan` | P2 | R2 | Add participant. |
| `jira_request_participant_remove_plan` | P2 | R2 | Remove participant. |
| `jira_request_transitions_list` | P2 | R1 | Available customer/agent transitions. |
| `jira_request_transition_plan` | P2 | R2/R3 | Apply request transition. |
| `jira_request_slas_get` | P2 | R1 | SLA cycles and breach state. |
| `jira_request_approvals_list` | P2 | R1 | Pending/completed approvals. |
| `jira_request_approval_plan` | P2 | R3 | Approve or decline with explicit effect. |
| `jira_queues_list` | P2 | R1 | Agent-visible queues. |
| `jira_queue_issues_list` | P2 | R1 | Bounded queue contents. |
| `jira_organizations_list` | P2 | R1 | Visible organizations. |
| `jira_organization_members_list` | P2 | R1 | Members where permitted. |
| `jira_organization_update_plan` | P3 | R3 | Create/delete organization or change membership. |
| `jira_customers_search` | P2 | R1 | Privacy-aware customer lookup. |
| `jira_customer_create_plan` | P3 | R3 | Create customer; enterprise-policy restricted. |
| `jira_knowledgebase_search` | P3 | R1 | Search linked knowledge base when API and permissions allow. |

Potential later Operations group: alerts search/get, acknowledge/close/escalate plans, teams, schedules, on-call responders, and incident/PIR links. Do not mix alert actions into request tools.

## Filters and dashboards

| Tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_filters_list` | P2 | R1 | Owned/favorite/visible filters. |
| `jira_filter_get` | P2 | R1 | Filter metadata and JQL subject to policy. |
| `jira_filter_create_plan` | P3 | R2 | Create a private filter by default. |
| `jira_filter_update_plan` | P3 | R2/R3 | Update JQL, name, ownership, or shares with explicit visibility. |
| `jira_filter_delete_plan` | P3 | R4 | Delete a filter. |
| `jira_dashboards_list` | P3 | R1 | Visible dashboards. |
| `jira_dashboard_get` | P3 | R1 | Dashboard and safe gadget metadata. |

Do not attempt arbitrary gadget configuration in the initial catalog.

## Webhooks and subscriptions

These are operational/admin capabilities, not routine agent tools. Dynamic Cloud webhooks expire and must be refreshed; delivery is at-least-once and requires deduplication.

| Tool | Tier | Risk | Purpose |
|---|---:|---:|---|
| `jira_subscriptions_list` | P3 | R1 | Logical subscriptions owned by this deployment. |
| `jira_subscription_create_plan` | P3 | R3 | Create a policy-bounded event subscription. |
| `jira_subscription_refresh_plan` | P3 | R2 | Refresh expiring webhooks. |
| `jira_subscription_delete_plan` | P3 | R3 | Remove a subscription. |
| `jira_webhook_failures_get` | P3 | R1 | Inspect delivery failures without payload leakage. |

The server chooses and validates callback URLs. Never accept an arbitrary callback URL from an agent.

## Administrative surface

Administrative tools belong in a separate connection profile with a separate narrowly governed token or OAuth grant and dual-control policies. Never reuse an everyday personal token merely because its user happens to be a Jira administrator. Start with read-only inspection; writes come only after the core mutation system is proven.

### Admin reads (P3)

- `jira_admin_audit_records_search`
- `jira_admin_workflows_list`
- `jira_admin_workflow_get`
- `jira_admin_workflow_schemes_list`
- `jira_admin_field_contexts_list`
- `jira_admin_field_options_list`
- `jira_admin_screens_get`
- `jira_admin_field_configurations_get`
- `jira_admin_permission_schemes_get`
- `jira_admin_issue_security_schemes_get`
- `jira_admin_notification_schemes_get`
- `jira_admin_project_config_get`

### Admin writes (P3/R4, disabled by default)

- Project create/update/archive/delete.
- Custom field/context/option create and update; destructive removal separately controlled.
- Workflow/status and workflow-scheme draft changes plus publish.
- Issue type, screen, field configuration, permission, issue-security, and notification scheme changes.
- Project role actor changes.
- User/group administration only if a customer has a compelling, separately reviewed need.

Do not expose a generic admin mutation tool or raw REST escape hatch. Each future admin action needs an impact analyzer, explicit affected-project reporting, rollback guidance, and stronger approval policy.

## Intentionally excluded from the normal tool list

- Raw HTTP/GraphQL execution.
- Arbitrary webhook callback URLs.
- Direct database access.
- Password, token, or secret management through MCP tools. Connection bootstrap and rotation happen outside the agent tool surface.
- Jira expression execution supplied by the agent.
- Arbitrary HTML rendering.
- Marketplace app endpoints without a dedicated, reviewed adapter.
- Global user/group/permission administration in the core server.
- Destructive actions that cannot produce a reliable impact plan.

## Open contract questions

1. Should planning tools be action-specific as proposed, or should a typed union reduce the number of exposed tools?
2. Should `jira_change_apply` require the original normalized arguments in addition to plan ID/digest for better client confirmation displays?
3. Which clients can reliably display output schemas, tool annotations, and elicitation today?
4. What is the maximum default bulk size: 25, 50, or 100 issues?
5. Should read-only metadata resources be exposed in P1, or wait until tools are stable?
