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
