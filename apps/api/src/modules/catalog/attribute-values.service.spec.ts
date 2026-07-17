import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AttributeValuesService } from "./attribute-values.service";

describe("AttributeValuesService typed mapping", () => {
  const service = new AttributeValuesService({} as never);

  it("stores integer values in the integer column", () => {
    const data = service.typedData("INTEGER", 125);
    expect(data.valueInteger).toBe(125n);
    expect(data.valueText).toBeNull();
  });

  it("stores ranges in dedicated decimal columns", () => {
    const data = service.typedData("RANGE", { min: 10.5, max: 42.75 });
    expect(data.rangeMin).toBe(10.5);
    expect(data.rangeMax).toBe(42.75);
  });

  it("rejects values that do not match the definition type", () => {
    expect(() => service.typedData("BOOLEAN", "yes")).toThrow(BadRequestException);
  });
});
