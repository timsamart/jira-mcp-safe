import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const baseEnv = {
  JIRA_BASE_URL: "https://jira.example.test",
  JIRA_TOKEN: "test-token",
  JIRA_CONNECTION_ID: "test",
  JIRA_ALLOWED_PROJECTS: "*",
  JIRA_ALLOWED_WRITE_FIELDS: "summary"
};

test("Data Center ignores an unresolved Cloud-only email placeholder", () => {
  const config = loadConfig({
    ...baseEnv,
    JIRA_DEPLOYMENT: "data_center",
    JIRA_EMAIL: "{env:JIRA_EMAIL}"
  });
  assert.equal(config.email, undefined);
});

test("Cloud still requires a resolved email address", () => {
  assert.throws(() => loadConfig({
    ...baseEnv,
    JIRA_DEPLOYMENT: "cloud",
    JIRA_EMAIL: "{env:JIRA_EMAIL}"
  }), /required for Jira Cloud/);
});
