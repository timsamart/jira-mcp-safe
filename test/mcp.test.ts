import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../src/config.js";
import { createServer } from "../src/server.js";

test("MCP server advertises the safe Jira vertical slice", async () => {
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: "*", allowedWriteFields: new Set(["summary"]), maxResults: 10, planTtlMs: 60_000 };
  const { server } = createServer(config);
  const client = new Client({ name: "test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  assert.deepEqual(names, ["jira_capabilities_get", "jira_identity_get", "jira_projects_list", "jira_issue_get", "jira_issue_search", "jira_issue_transitions_list", "jira_issue_create_schema_get", "jira_issue_create_plan", "jira_issue_create_from_issue_plan", "jira_issue_update_plan", "jira_change_apply"]);
  assert.equal(tools.tools.find((tool) => tool.name === "jira_change_apply")?.annotations?.destructiveHint, true);
  const result = await client.callTool({ name: "jira_capabilities_get", arguments: {} });
  assert.equal(result.isError, undefined);
  await client.close();
  await server.close();
});
