import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.js";
import { createServer } from "../src/server.js";

function textValue(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, any> {
  if (!("content" in result) || !Array.isArray(result.content)) throw new Error("Expected immediate MCP tool result");
  const text = result.content.find((item) => item.type === "text");
  assert.ok(text && "text" in text);
  return JSON.parse(text.text) as Record<string, any>;
}

test("Jira creation uses exact native metadata, idempotency, approval plan, and verification", async () => {
  let createCalls = 0;
  let createdInput: Record<string, unknown> | undefined;
  const createFields = {
    project: { name: "Project", required: true, operations: ["set"] },
    issuetype: { name: "Issue Type", required: true, operations: ["set"] },
    summary: { name: "Summary", required: true, operations: ["set"] },
    description: { name: "Description", required: false, operations: ["set"], schema: { type: "doc", system: "description" } },
    labels: { name: "Labels", required: false, operations: ["set", "add"] }
  };
  const fakeClient = {
    async identity() { return {}; }, async projects() { return []; }, async search() { return {}; }, async transitions() { return {}; },
    async project() { return { id: "100", key: "APP", name: "Application" }; },
    async issueType() { return { id: "1", name: "Task", subtask: false }; },
    async createSchema() { return { fields: createFields }; },
    async issue() { throw new Error("not used without a parent"); },
    async editSchema() { throw new Error("not used"); }, async update() { throw new Error("not used"); },
    async createIssue(projectId: string, issueTypeId: string, fields: Record<string, unknown>, parentKey?: string) {
      createCalls += 1;
      createdInput = { projectId, issueTypeId, fields: structuredClone(fields), parentKey };
      return { key: "APP-7", fields: { ...fields, project: { id: "100", key: "APP" }, issuetype: { id: "1", name: "Task" }, created: "now", updated: "now" } };
    }
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: new Set(["APP"]), allowedWriteFields: new Set(["summary", "description", "labels"]), maxResults: 10, planTtlMs: 60_000 };
  const { server } = createServer(config, fakeClient);
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const arguments_ = { projectKey: "APP", issueTypeId: "1", fields: { summary: "Native task", description: { type: "doc", version: 1, content: [] } }, idempotencyKey: "create-task-0001" };
  const proposal = textValue(await client.callTool({ name: "jira_issue_create_plan", arguments: arguments_ }));
  assert.equal(proposal.preview.kind, "create");
  assert.deepEqual(proposal.preview.project, { id: "100", key: "APP" });
  assert.deepEqual(proposal.preview.issueType, { id: "1", name: "Task" });
  assert.equal(proposal.preview.fields.find((field: Record<string, unknown>) => field.fieldId === "description").value.type, "doc");
  assert.equal(proposal.policy.enforcement, "client_tool_approval");

  const sameProposal = textValue(await client.callTool({ name: "jira_issue_create_plan", arguments: arguments_ }));
  assert.equal(sameProposal.planId, proposal.planId);
  const conflicting = await client.callTool({ name: "jira_issue_create_plan", arguments: { ...arguments_, fields: { summary: "Different" } } });
  assert.equal(conflicting.isError, true);
  assert.equal(textValue(conflicting).error.code, "IDEMPOTENCY_CONFLICT");

  const applied = textValue(await client.callTool({ name: "jira_change_apply", arguments: { planId: proposal.planId, digest: proposal.digest } }));
  assert.equal(applied.created, true);
  assert.equal(applied.verified, true);
  assert.equal(applied.issue.key, "APP-7");
  assert.equal(createCalls, 1);
  assert.deepEqual(createdInput, { projectId: "100", issueTypeId: "1", fields: arguments_.fields, parentKey: undefined });

  await client.close(); await server.close();
});

test("Jira creation rejects missing required and unknown fields", async () => {
  const fakeClient = {
    async identity() { return {}; }, async projects() { return []; }, async search() { return {}; }, async transitions() { return {}; },
    async project() { return { id: "100", key: "APP" }; }, async issueType() { return { id: "1", name: "Task" }; },
    async createSchema() { return { fields: { project: { required: true }, issuetype: { required: true }, summary: { name: "Summary", required: true, operations: ["set"] } } }; },
    async issue() { throw new Error("not used"); }, async editSchema() { return {}; }, async update() { return {}; }, async createIssue() { throw new Error("must not create"); }
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: new Set(["APP"]), allowedWriteFields: new Set(["summary", "ghost"]), maxResults: 10, planTtlMs: 60_000 };
  const { server } = createServer(config, fakeClient);
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const missing = await client.callTool({ name: "jira_issue_create_plan", arguments: { projectKey: "APP", issueTypeId: "1", fields: { ghost: "x" }, idempotencyKey: "required-0001" } });
  assert.equal(missing.isError, true);
  assert.equal(textValue(missing).error.code, "FIELD_NOT_EDITABLE");
  const noSummary = await client.callTool({ name: "jira_issue_create_plan", arguments: { projectKey: "APP", issueTypeId: "1", fields: { }, idempotencyKey: "required-0002" } });
  assert.equal(noSummary.isError, true);
  await client.close(); await server.close();
});

test("Jira can use an exact issue version as a field-selective ticket template", async () => {
  const sourceUpdated = "2026-07-04T10:00:00.000+0000";
  let issueReads = 0;
  let createdFields: Record<string, unknown> | undefined;
  const fakeClient = {
    async identity() { return {}; }, async projects() { return []; }, async search() { return {}; }, async transitions() { return {}; },
    async project() { return { id: "100", key: "APP" }; }, async issueType() { return { id: "1", name: "Task" }; },
    async createSchema() { return { fields: { project: { required: true }, issuetype: { required: true }, summary: { name: "Summary", required: true, operations: ["set"] }, description: { name: "Description", operations: ["set"] }, labels: { name: "Labels", operations: ["set"] } } }; },
    async issue(key: string) { issueReads += 1; return { key, fields: { updated: sourceUpdated, description: "Copied description", labels: ["template"] } }; },
    async editSchema() { return {}; }, async update() { return {}; },
    async createIssue(_projectId: string, _issueTypeId: string, fields: Record<string, unknown>) { createdFields = structuredClone(fields); return { key: "APP-8", fields: { ...fields, project: { id: "100" }, issuetype: { id: "1" } } }; }
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: new Set(["APP"]), allowedWriteFields: new Set(["summary", "description", "labels"]), maxResults: 10, planTtlMs: 60_000 };
  const { server } = createServer(config, fakeClient); const client = new Client({ name: "test", version: "1" }); const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const proposal = textValue(await client.callTool({ name: "jira_issue_create_from_issue_plan", arguments: {
    sourceIssueKey: "APP-3", sourceExpectedUpdated: sourceUpdated, copyFieldIds: ["description", "labels"], overrides: { summary: "New ticket", labels: ["fresh"] },
    projectKey: "APP", issueTypeId: "1", idempotencyKey: "issue-template-0001"
  } }));
  assert.deepEqual(proposal.preview.sourceIssue, { key: "APP-3", updated: sourceUpdated, copiedFieldIds: ["description", "labels"], overriddenFieldIds: ["labels"] });
  assert.equal(proposal.preview.fields.find((field: Record<string, unknown>) => field.fieldId === "description").value, "Copied description");
  const applied = textValue(await client.callTool({ name: "jira_change_apply", arguments: { planId: proposal.planId, digest: proposal.digest } }));
  assert.equal(applied.verified, true);
  assert.equal(issueReads, 2);
  assert.deepEqual(createdFields, { description: "Copied description", labels: ["fresh"], summary: "New ticket" });
  await client.close(); await server.close();
});

test("Jira issue-template creation refuses apply after the source issue changes", async () => {
  let updated = "v1"; let createCalls = 0;
  const fakeClient = {
    async identity() { return {}; }, async projects() { return []; }, async search() { return {}; }, async transitions() { return {}; }, async project() { return { id: "100", key: "APP" }; }, async issueType() { return { id: "1", name: "Task" }; },
    async createSchema() { return { fields: { project: { required: true }, issuetype: { required: true }, summary: { name: "Summary", required: true, operations: ["set"] } } }; },
    async issue(key: string) { return { key, fields: { updated, summary: "Template" } }; }, async editSchema() { return {}; }, async update() { return {}; }, async createIssue() { createCalls += 1; return {}; }
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: new Set(["APP"]), allowedWriteFields: new Set(["summary"]), maxResults: 10, planTtlMs: 60_000 };
  const { server } = createServer(config, fakeClient); const client = new Client({ name: "test", version: "1" }); const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const proposal = textValue(await client.callTool({ name: "jira_issue_create_from_issue_plan", arguments: { sourceIssueKey: "APP-1", sourceExpectedUpdated: "v1", copyFieldIds: ["summary"], overrides: {}, projectKey: "APP", issueTypeId: "1", idempotencyKey: "stale-source-1" } }));
  updated = "v2";
  const result = await client.callTool({ name: "jira_change_apply", arguments: { planId: proposal.planId, digest: proposal.digest } });
  assert.equal(result.isError, true); assert.equal(textValue(result).error.code, "VERSION_CONFLICT"); assert.equal(createCalls, 0);
  await client.close(); await server.close();
});
