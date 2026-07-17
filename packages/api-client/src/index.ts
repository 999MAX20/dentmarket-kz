export type ApiContext = {
  actorId?: string;
  organizationId?: string;
  accessToken?: string;
};

export type SessionHandoffEnvelope = {
  actorId?: string;
  displayName?: string;
  organizationDisplayName?: string;
  organizationId?: string;
  accessToken?: string;
  handoffCode?: string;
  capability?: string;
};

export function parseSessionHandoff(serialized: string | null, capability: "BUYER" | "SUPPLIER"): SessionHandoffEnvelope | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as SessionHandoffEnvelope;
    if (value.capability !== capability || !value.organizationId || (!value.accessToken && !value.actorId && !value.handoffCode)) return null;
    return value;
  } catch {
    return null;
  }
}

export class MarketplaceApiError extends Error {
  constructor(public readonly status: number, public readonly payload: unknown) {
    super(typeof payload === "object" && payload && "message" in payload ? String(payload.message) : `Marketplace API returned ${status}`);
  }
}

export class MarketplaceApiClient {
  constructor(private readonly baseUrl: string, private readonly context: ApiContext) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.context.accessToken) headers.authorization = `Bearer ${this.context.accessToken}`;
    else {
      if (this.context.actorId) headers["x-user-id"] = this.context.actorId;
      if (this.context.organizationId) headers["x-organization-id"] = this.context.organizationId;
    }
    return headers;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...this.headers(), ...init.headers },
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = text; }
    }
    if (!response.ok) throw new MarketplaceApiError(response.status, payload);
    return payload as T;
  }

  async download(path: string): Promise<{ blob: Blob; fileName: string | null }> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      let payload: unknown = text;
      try { payload = JSON.parse(text); } catch {}
      throw new MarketplaceApiError(response.status, payload);
    }
    const disposition = response.headers.get("content-disposition");
    const encodedName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    return { blob: await response.blob(), fileName: encodedName ? decodeURIComponent(encodedName) : null };
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: unknown) { return this.request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }); }
  put<T>(path: string, body: unknown) { return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) }); }
  patch<T>(path: string, body: unknown) { return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) }); }
}
