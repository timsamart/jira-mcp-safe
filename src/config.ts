import { z } from "zod";

const optionalEmail = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized === "" || normalized === "{env:JIRA_EMAIL}" ? undefined : normalized;
}, z.string().email().optional());

const schema = z.object({
  JIRA_BASE_URL: z.string().url(),
  JIRA_DEPLOYMENT: z.enum(["cloud", "data_center"]),
  JIRA_TOKEN: z.string().min(1),
  JIRA_EMAIL: optionalEmail,
  JIRA_CONNECTION_ID: z.string().min(1).default("default"),
  JIRA_ALLOWED_PROJECTS: z.string().min(1),
  JIRA_ALLOWED_WRITE_FIELDS: z.string().min(1).default("summary,description,assignee,priority,labels,duedate,components,fixVersions"),
  JIRA_MAX_RESULTS: z.coerce.number().int().min(1).max(100).default(50),
  JIRA_PLAN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600)
}).superRefine((value, context) => {
  if (value.JIRA_DEPLOYMENT === "cloud" && !value.JIRA_EMAIL) {
    context.addIssue({ code: "custom", path: ["JIRA_EMAIL"], message: "is required for Jira Cloud" });
  }
});

export type Config = {
  baseUrl: URL;
  deployment: "cloud" | "data_center";
  token: string;
  email?: string;
  connectionId: string;
  allowedProjects: ReadonlySet<string> | "*";
  allowedWriteFields: ReadonlySet<string>;
  maxResults: number;
  planTtlMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = schema.parse(env);
  const url = new URL(raw.JIRA_BASE_URL);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("JIRA_BASE_URL must use HTTPS (localhost is allowed for tests)");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  const projects = raw.JIRA_ALLOWED_PROJECTS.trim();
  return {
    baseUrl: url,
    deployment: raw.JIRA_DEPLOYMENT,
    token: raw.JIRA_TOKEN,
    ...(raw.JIRA_EMAIL ? { email: raw.JIRA_EMAIL } : {}),
    connectionId: raw.JIRA_CONNECTION_ID,
    allowedProjects: projects === "*" ? "*" : new Set(projects.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)),
    allowedWriteFields: new Set(raw.JIRA_ALLOWED_WRITE_FIELDS.split(",").map((item) => item.trim()).filter(Boolean)),
    maxResults: raw.JIRA_MAX_RESULTS,
    planTtlMs: raw.JIRA_PLAN_TTL_SECONDS * 1000
  };
}
