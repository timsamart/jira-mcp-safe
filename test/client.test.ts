import assert from "node:assert/strict";
import test from "node:test";
import type { Config } from "../src/config.js";
import { JiraClient } from "../src/jira-client.js";

test("Data Center requests preserve the configured context path", async () => {
  let requested = "";
  let authorization = "";
  const fetcher: typeof fetch = async (input, init) => {
    requested = String(input);
    authorization = String((init?.headers as Record<string, string>).Authorization);
    return new Response(JSON.stringify({ name: "Ada" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test/jira"), deployment: "data_center", token: "secret-value", connectionId: "test", allowedProjects: "*", allowedWriteFields: new Set(["summary"]), maxResults: 10, planTtlMs: 60_000 };
  const result = await new JiraClient(config, fetcher).identity();
  assert.equal(requested, "https://jira.example.test/jira/rest/api/2/myself");
  assert.equal(authorization, "Bearer secret-value");
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("issue update sends only the explicitly requested field patch", async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method ?? "GET", ...(typeof init?.body === "string" ? { body: init.body } : {}) });
    if (init?.method === "PUT") return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ key: "APP-1", fields: { summary: "New", updated: "later", untouched: "keep" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: new Set(["APP"]), allowedWriteFields: new Set(["summary"]), maxResults: 10, planTtlMs: 60_000 };
  await new JiraClient(config, fetcher).update("APP-1", { summary: "New" });
  const write = requests.find((request) => request.method === "PUT");
  assert.deepEqual(JSON.parse(write?.body ?? "null"), { fields: { summary: "New" } });
  assert.match(requests.at(-1)?.url ?? "", /fields=summary%2Cupdated$/);
});

test("issue creation sends native project, issuetype, parent, and explicit fields", async () => {
  let createBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") {
      createBody = String(init.body);
      return new Response(JSON.stringify({ id: "7", key: "APP-7" }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ key: "APP-7", fields: { summary: "Task", project: { id: "100" }, issuetype: { id: "1" } } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const config: Config = { baseUrl: new URL("https://jira.example.test"), deployment: "data_center", token: "test", connectionId: "test", allowedProjects: new Set(["APP"]), allowedWriteFields: new Set(["summary"]), maxResults: 10, planTtlMs: 60_000 };
  await new JiraClient(config, fetcher).createIssue("100", "1", { summary: "Task" }, "APP-1");
  assert.deepEqual(JSON.parse(createBody), { fields: { summary: "Task", project: { id: "100" }, issuetype: { id: "1" }, parent: { key: "APP-1" } } });
});
