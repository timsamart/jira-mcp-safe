import type { Config } from "./config.js";
import { SafeError } from "./core.js";

type Json = Record<string, unknown>;

export class JiraClient {
  constructor(private readonly config: Config, private readonly fetcher: typeof fetch = fetch) {}

  private apiPath(cloudPath: string, dataCenterPath = cloudPath.replace("/rest/api/3/", "/rest/api/2/")): string {
    return this.config.deployment === "cloud" ? cloudPath : dataCenterPath;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Json> {
    const target = new URL(path.replace(/^\//, ""), `${this.config.baseUrl.href.replace(/\/$/, "")}/`);
    if (target.origin !== this.config.baseUrl.origin) throw new SafeError("INVALID_INPUT", "Request escaped configured Jira origin");
    const auth = this.config.deployment === "cloud"
      ? `Basic ${Buffer.from(`${this.config.email}:${this.config.token}`).toString("base64")}`
      : `Bearer ${this.config.token}`;
    let response: Response;
    try {
      response = await this.fetcher(target, {
        ...init,
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", Authorization: auth, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers }
      });
    } catch {
      throw new SafeError("UPSTREAM_UNAVAILABLE", "Jira is unavailable", true);
    }
    if (response.status === 401) throw new SafeError("CONNECTION_AUTH_INVALID", "Jira rejected the configured credential");
    if (response.status === 403) throw new SafeError("POLICY_DENIED", "Jira denied this operation");
    if (response.status === 404) throw new SafeError("NOT_FOUND_OR_NOT_VISIBLE", "Jira object was not found or is not visible");
    if (response.status === 409 || response.status === 412) throw new SafeError("VERSION_CONFLICT", "Jira object changed; create a new plan");
    if (response.status === 429) throw new SafeError("UPSTREAM_RATE_LIMITED", "Jira rate limit reached", true);
    if (!response.ok) throw new SafeError("UPSTREAM_UNAVAILABLE", `Jira request failed with status ${response.status}`, response.status >= 500);
    if (response.status === 204) return {};
    return await response.json() as Json;
  }

  private enforceProject(project: string): void {
    if (this.config.allowedProjects !== "*" && !this.config.allowedProjects.has(project.toUpperCase())) {
      throw new SafeError("POLICY_DENIED", `Project ${project} is outside JIRA_ALLOWED_PROJECTS`);
    }
  }

  async identity() { return this.request(this.apiPath("/rest/api/3/myself")); }

  async projects(limit: number) {
    const max = Math.min(limit, this.config.maxResults);
    const data = await this.request(this.apiPath(`/rest/api/3/project/search?maxResults=${max}`, "/rest/api/2/project"));
    const values = Array.isArray(data.values) ? data.values : Array.isArray(data) ? data : [];
    return this.config.allowedProjects === "*" ? values : values.filter((item) => {
      const key = (item as Json).key;
      return typeof key === "string" && this.config.allowedProjects !== "*" && this.config.allowedProjects.has(key.toUpperCase());
    });
  }

  async project(key: string) {
    this.enforceProject(key);
    return this.request(this.apiPath(`/rest/api/3/project/${encodeURIComponent(key)}`));
  }

  async issueType(id: string) {
    return this.request(this.apiPath(`/rest/api/3/issuetype/${encodeURIComponent(id)}`));
  }

  async issue(key: string, fields: string[]) {
    this.enforceProject(key.split("-")[0] ?? "");
    const selected = fields.length ? fields : ["summary", "status", "assignee", "priority", "updated"];
    return this.request(this.apiPath(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(selected.join(","))}`));
  }

  async search(jql: string, fields: string[], limit: number) {
    const maxResults = Math.min(limit, this.config.maxResults);
    if (this.config.allowedProjects !== "*") {
      const allowed = [...this.config.allowedProjects].map((key) => `"${key.replaceAll('"', '\\"')}"`).join(",");
      jql = `project in (${allowed}) AND (${jql})`;
    }
    const selected = fields.length ? fields : ["summary", "status", "assignee", "priority", "updated"];
    return this.request(this.apiPath("/rest/api/3/search/jql", "/rest/api/2/search"), {
      method: "POST", body: JSON.stringify({ jql, fields: selected, maxResults })
    });
  }

  async transitions(key: string) {
    this.enforceProject(key.split("-")[0] ?? "");
    return this.request(this.apiPath(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions?expand=transitions.fields`));
  }

  async editSchema(key: string) {
    this.enforceProject(key.split("-")[0] ?? "");
    return this.request(this.apiPath(`/rest/api/3/issue/${encodeURIComponent(key)}/editmeta`));
  }

  async createSchema(projectKey: string, issueTypeId: string) {
    this.enforceProject(projectKey);
    if (this.config.deployment === "cloud") {
      const fields: Json[] = [];
      let startAt = 0;
      let expectedTotal: number | undefined;
      for (let page = 0; page < 10; page += 1) {
        const data = await this.request(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueTypeId)}?startAt=${startAt}&maxResults=100`);
        const values = Array.isArray(data.values) ? data.values as Json[] : [];
        fields.push(...values);
        const total = typeof data.total === "number" ? data.total : fields.length;
        expectedTotal = total;
        if (data.isLast === true || values.length === 0 || fields.length >= total) break;
        startAt += values.length;
      }
      if (expectedTotal !== undefined && fields.length < expectedTotal) throw new SafeError("UPSTREAM_UNAVAILABLE", "Jira create metadata exceeded the safe pagination bound");
      return { fields: Object.fromEntries(fields.map((field) => [String(field.fieldId ?? field.key ?? ""), field]).filter(([id]) => id)) };
    }
    const data = await this.request(`/rest/api/2/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&issuetypeIds=${encodeURIComponent(issueTypeId)}&expand=projects.issuetypes.fields`);
    const projects = Array.isArray(data.projects) ? data.projects as Json[] : [];
    const project = projects.find((item) => item.key === projectKey);
    const issueTypes = Array.isArray(project?.issuetypes) ? project.issuetypes as Json[] : [];
    const issueType = issueTypes.find((item) => String(item.id) === issueTypeId);
    return { project, issueType, fields: (issueType?.fields as Json | undefined) ?? {} };
  }

  async createIssue(projectId: string, issueTypeId: string, fields: Record<string, unknown>, parentKey?: string) {
    const payloadFields = {
      ...fields, project: { id: projectId }, issuetype: { id: issueTypeId },
      ...(parentKey ? { parent: { key: parentKey } } : {})
    };
    const created = await this.request(this.apiPath("/rest/api/3/issue"), { method: "POST", body: JSON.stringify({ fields: payloadFields }) });
    if (typeof created.key !== "string") throw new SafeError("UPSTREAM_UNAVAILABLE", "Jira create response omitted the new issue key");
    return this.issue(created.key, [...Object.keys(fields), "project", "issuetype", "parent", "created", "updated"]);
  }

  async update(key: string, fields: Record<string, unknown>) {
    this.enforceProject(key.split("-")[0] ?? "");
    await this.request(this.apiPath(`/rest/api/3/issue/${encodeURIComponent(key)}`), { method: "PUT", body: JSON.stringify({ fields }) });
    return this.issue(key, [...Object.keys(fields), "updated"]);
  }
}
