import { describe, expect, it } from "vitest";
import { jsonSafeReplacer } from "./json-safe-replacer";

describe("jsonSafeReplacer", () => {
  it("serializes nested bigint values without losing their exact decimal representation", () => {
    const payload = { direct: 9_007_199_254_740_993n, nested: [{ value: -12n }] };

    expect(JSON.stringify(payload, jsonSafeReplacer)).toBe(
      '{"direct":"9007199254740993","nested":[{"value":"-12"}]}',
    );
  });

  it("preserves ordinary JSON values", () => {
    const payload = { count: 2, enabled: true, value: null, label: "ok" };

    expect(JSON.parse(JSON.stringify(payload, jsonSafeReplacer))).toEqual(payload);
  });
});
