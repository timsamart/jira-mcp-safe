import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.js";
import { JiraClient } from "../src/jira-client.js";
import { createServer } from "../src/server.js";

function textValue(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, any> {
  if (!("content" in result) || !Array.isArray(result.content)) throw new Error("Expected immediate MCP tool result");
  const text = result.content.find((item) => item.type === "text");
  assert.ok(text && "text" in text);
  return JSON.parse(text.text) as Record<string, any>;
}

test("Jira mutation guardrails fail closed before any upstream write", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ method: init?.method ?? "GET", url: String(input) });
    throw new Error(`unexpected upstream call: ${init?.method ?? "GET"} ${String(input)}`);
  };
  const config: Config = {
    baseUrl: new URL("https://jira.example.test"),
    deployment: "data_center",
    token: "test",
    connectionId: "test",
    allowedProjects: new Set(["APP"]),
    allowedWriteFields: new Set(["summary"]),
    maxResults: 10,
    planTtlMs: 60_000
  };
  const { server } = createServer(config, new JiraClient(config, fetcher));
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  for (const [index, projectKey] of ["OPS", "SEC", "HR", "FIN", "LEGAL"].entries()) {
    const create = await client.callTool({
      name: "jira_issue_create_plan",
      arguments: { projectKey, issueTypeId: "1", fields: { summary: "Denied" }, idempotencyKey: `deny-create-${index}` }
    });
    assert.equal(create.isError, true);
    assert.equal(textValue(create).error.code, "POLICY_DENIED");

    const createFromIssue = await client.callTool({
      name: "jira_issue_create_from_issue_plan",
      arguments: {
        sourceIssueKey: "APP-1",
        sourceExpectedUpdated: "v1",
        copyFieldIds: ["summary"],
        overrides: {},
        projectKey,
        issueTypeId: "1",
        idempotencyKey: `deny-template-${index}`
      }
    });
    assert.equal(createFromIssue.isError, true);
    assert.equal(textValue(createFromIssue).error.code, "POLICY_DENIED");
  }

  const update = await client.callTool({ name: "jira_issue_update_plan", arguments: { key: "OPS-1", expectedUpdated: "v1", fields: { summary: "Denied" } } });
  assert.equal(update.isError, true);
  assert.equal(textValue(update).error.code, "POLICY_DENIED");

  const forgedApply = await client.callTool({ name: "jira_change_apply", arguments: { planId: "plan_fake", digest: "sha256:deadbeef" } });
  assert.equal(forgedApply.isError, true);
  assert.equal(textValue(forgedApply).error.code, "INVALID_INPUT");

  assert.equal(calls.length, 0);

  await client.close();
  await server.close();
});
