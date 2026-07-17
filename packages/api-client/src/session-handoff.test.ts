import { describe, expect, it } from "vitest";
import { parseSessionHandoff } from "./session-handoff.js";

describe("session handoff envelope", () => {
  it("accepts a one-time handoff code without exposing an access token", () => {
    expect(parseSessionHandoff(JSON.stringify({ capability: "BUYER", organizationId: "org-1", handoffCode: "a".repeat(32) }), "BUYER")).toMatchObject({ handoffCode: "a".repeat(32) });
  });

  it("rejects wrong capability, missing organization and malformed JSON", () => {
    expect(parseSessionHandoff(JSON.stringify({ capability: "SUPPLIER", organizationId: "org-1", handoffCode: "code" }), "BUYER")).toBeNull();
    expect(parseSessionHandoff(JSON.stringify({ capability: "BUYER", handoffCode: "code" }), "BUYER")).toBeNull();
    expect(parseSessionHandoff("not-json", "BUYER")).toBeNull();
  });
});
