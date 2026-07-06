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

test("planning resolves exact metadata and applying patches only requested fields", async () => {
  const issueReads: string[][] = [];
  let appliedFields: Record<string, unknown> | undefined;
  const state: Record<string, unknown> = { summary: "Old", labels: ["one"], untouched: "KEEP", updated: "v1" };
  const fakeClient = {
    async identity() { return {}; },
    async projects() { return []; },
    async project() { throw new Error("not used"); },
    async issueType() { throw new Error("not used"); },
    async search() { return {}; },
    async transitions() { return {}; },
    async issue(_key: string, fields: string[]) {
      issueReads.push(fields);
      return { key: "APP-1", fields: Object.fromEntries(fields.map((field) => [field, state[field]])) };
    },
    async editSchema() {
      return { fields: { summary: { name: "Summary", operations: ["set"] }, labels: { name: "Labels", operations: ["add", "set", "remove"] } } };
    },
    async createSchema() { throw new Error("not used"); },
    async createIssue() { throw new Error("not used"); },
    async update(_key: string, fields: Record<string, unknown>) {
      appliedFields = structuredClone(fields);
      Object.assign(state, fields, { updated: "v2" });
      return { key: "APP-1", fields: Object.fromEntries([...Object.keys(fields), "updated"].map((field) => [field, state[field]])) };
    }
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: new Set(["APP"]), allowedWriteFields: new Set(["summary", "labels", "ghost"]), maxResults: 10, planTtlMs: 60_000 };
  const { server } = createServer(config, fakeClient);
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const proposalResponse = await client.callTool({ name: "jira_issue_update_plan", arguments: { key: "app-1", expectedUpdated: "v1", fields: { summary: "New", labels: ["two"] } } });
  assert.equal(proposalResponse.isError, undefined);
  const plan = textValue(proposalResponse);
  assert.deepEqual(issueReads[0], ["labels", "summary", "updated"]);
  assert.deepEqual(plan.preview.changes, [
    { fieldId: "labels", name: "Labels", before: ["one"], after: ["two"] },
    { fieldId: "summary", name: "Summary", before: "Old", after: "New" }
  ]);
  assert.equal(plan.policy.enforcement, "client_tool_approval");

  const applyResponse = await client.callTool({ name: "jira_change_apply", arguments: { planId: plan.planId, digest: plan.digest } });
  assert.equal(applyResponse.isError, undefined);
  assert.deepEqual(appliedFields, { summary: "New", labels: ["two"] });
  assert.equal(state.untouched, "KEEP");
  assert.deepEqual(issueReads[1], ["updated"]);

  const unknownResponse = await client.callTool({ name: "jira_issue_update_plan", arguments: { key: "APP-1", expectedUpdated: "v2", fields: { ghost: "invented" } } });
  assert.equal(unknownResponse.isError, true);
  assert.equal(textValue(unknownResponse).error.code, "FIELD_NOT_EDITABLE");

  const movedKeyResponse = await client.callTool({ name: "jira_issue_update_plan", arguments: { key: "APP-2", expectedUpdated: "v2", fields: { summary: "No redirect writes" } } });
  assert.equal(movedKeyResponse.isError, true);
  assert.match(String(textValue(movedKeyResponse).error.message), /exact canonical key/);

  await client.close();
  await server.close();
});
