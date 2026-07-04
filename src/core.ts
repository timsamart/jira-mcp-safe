import { createHash, randomUUID } from "node:crypto";

export type ErrorCode =
  | "AUTH_REQUIRED" | "CONNECTION_AUTH_INVALID" | "POLICY_DENIED"
  | "NOT_FOUND_OR_NOT_VISIBLE" | "PLAN_EXPIRED" | "PLAN_DIGEST_MISMATCH"
  | "PLAN_ALREADY_USED" | "VERSION_CONFLICT" | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE" | "FIELD_NOT_EDITABLE" | "IDEMPOTENCY_CONFLICT" | "INVALID_INPUT";

export class SafeError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly retryable = false) {
    super(message);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

export type JiraUpdateAction = {
  operation: "issue.update";
  issueKey: string;
  fields: Record<string, unknown>;
  expectedUpdated: string;
  changes: Array<{ fieldId: string; name: string; before: unknown; after: unknown }>;
};

export type JiraCreateAction = {
  operation: "issue.create";
  projectId: string;
  projectKey: string;
  issueTypeId: string;
  issueTypeName: string;
  parentKey?: string;
  fields: Record<string, unknown>;
  fieldDetails: Array<{ fieldId: string; name: string; value: unknown; required: boolean }>;
  idempotencyKey: string;
  sourceIssue?: { key: string; updated: string; copiedFieldIds: string[]; overriddenFieldIds: string[] };
};

export type JiraAction = JiraUpdateAction | JiraCreateAction;

export type Plan = {
  planId: string;
  digest: string;
  action: JiraAction;
  createdAt: string;
  expiresAt: string;
  preview:
    | { kind: "update"; summary: string; changes: JiraUpdateAction["changes"] }
    | { kind: "create"; summary: string; project: { id: string; key: string }; issueType: { id: string; name: string }; parentKey?: string; fields: JiraCreateAction["fieldDetails"]; sourceIssue?: JiraCreateAction["sourceIssue"] };
  policy: { decision: "require_confirmation"; revision: "local-v1"; enforcement: "client_tool_approval"; applyTool: "jira_change_apply" };
  used: boolean;
};

export class PlanStore {
  readonly #plans = new Map<string, Plan>();
  readonly #idempotency = new Map<string, { actionDigest: string; planId: string }>();
  constructor(private readonly ttlMs: number, private readonly now = () => Date.now()) {}

  create(action: JiraAction): Plan {
    if (action.operation === "issue.create") {
      const ledgerKey = `issue.create:${action.idempotencyKey}`;
      const actionDigest = digest(action);
      const existing = this.#idempotency.get(ledgerKey);
      if (existing) {
        if (existing.actionDigest !== actionDigest) throw new SafeError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different issue create request");
        return this.get(existing.planId);
      }
    }
    const created = this.now();
    const material = { action, created, nonce: randomUUID() };
    const plan: Plan = {
      planId: `plan_${randomUUID()}`,
      digest: digest(material),
      action,
      createdAt: new Date(created).toISOString(),
      expiresAt: new Date(created + this.ttlMs).toISOString(),
      preview: action.operation === "issue.update"
        ? { kind: "update", summary: `Patch only ${action.changes.length} explicitly requested field(s) on ${action.issueKey}`, changes: action.changes }
        : {
            kind: "create", summary: `Create one ${action.issueTypeName} in ${action.projectKey}`,
            project: { id: action.projectId, key: action.projectKey }, issueType: { id: action.issueTypeId, name: action.issueTypeName },
            ...(action.parentKey ? { parentKey: action.parentKey } : {}), fields: action.fieldDetails,
            ...(action.sourceIssue ? { sourceIssue: action.sourceIssue } : {})
          },
      policy: { decision: "require_confirmation", revision: "local-v1", enforcement: "client_tool_approval", applyTool: "jira_change_apply" },
      used: false
    };
    this.#plans.set(plan.planId, plan);
    if (action.operation === "issue.create") this.#idempotency.set(`issue.create:${action.idempotencyKey}`, { actionDigest: digest(action), planId: plan.planId });
    return structuredClone(plan);
  }

  get(planId: string): Plan {
    const plan = this.#plans.get(planId);
    if (!plan) throw new SafeError("INVALID_INPUT", "Unknown plan ID");
    return structuredClone(plan);
  }

  consume(planId: string, suppliedDigest: string): Plan {
    const plan = this.#plans.get(planId);
    if (!plan) throw new SafeError("INVALID_INPUT", "Unknown plan ID");
    if (plan.used) throw new SafeError("PLAN_ALREADY_USED", "Plan has already been applied");
    if (this.now() >= Date.parse(plan.expiresAt)) throw new SafeError("PLAN_EXPIRED", "Plan has expired");
    if (plan.digest !== suppliedDigest) throw new SafeError("PLAN_DIGEST_MISMATCH", "Plan digest does not match");
    plan.used = true;
    return structuredClone(plan);
  }
}

export type AuditEvent = {
  id: string;
  at: string;
  operation: string;
  target?: string;
  outcome: "allowed" | "denied" | "succeeded" | "failed";
  correlationId: string;
};

export class AuditLog {
  readonly #events: AuditEvent[] = [];
  record(event: Omit<AuditEvent, "id" | "at">): void {
    this.#events.push({ id: randomUUID(), at: new Date().toISOString(), ...event });
  }
  list(): readonly AuditEvent[] { return structuredClone(this.#events); }
}

export function safeResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: { result: value } };
}

export function errorResult(error: unknown) {
  const safe = error instanceof SafeError ? error : new SafeError("UPSTREAM_UNAVAILABLE", "Unexpected server failure", true);
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code: safe.code, message: safe.message, retryable: safe.retryable } }, null, 2) }]
  };
}
