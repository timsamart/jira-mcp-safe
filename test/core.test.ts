import assert from "node:assert/strict";
import test from "node:test";
import { PlanStore, SafeError } from "../src/core.js";

const action = { operation: "issue.update" as const, issueKey: "APP-1", fields: { summary: "Safer" }, expectedUpdated: "2026-07-03T10:00:00.000Z", changes: [{ fieldId: "summary", name: "Summary", before: "Old", after: "Safer" }] };

test("plans are digest-bound and one-time", () => {
  const store = new PlanStore(60_000);
  const plan = store.create(action);
  assert.throws(() => store.consume(plan.planId, "sha256:wrong"), (error: unknown) => error instanceof SafeError && error.code === "PLAN_DIGEST_MISMATCH");
  const consumed = store.consume(plan.planId, plan.digest).action;
  assert.equal(consumed.operation === "issue.update" ? consumed.issueKey : undefined, "APP-1");
  assert.throws(() => store.consume(plan.planId, plan.digest), (error: unknown) => error instanceof SafeError && error.code === "PLAN_ALREADY_USED");
});

test("expired plans fail closed", () => {
  let now = 1_000;
  const store = new PlanStore(60_000, () => now);
  const plan = store.create(action);
  now += 60_000;
  assert.throws(() => store.consume(plan.planId, plan.digest), (error: unknown) => error instanceof SafeError && error.code === "PLAN_EXPIRED");
});
