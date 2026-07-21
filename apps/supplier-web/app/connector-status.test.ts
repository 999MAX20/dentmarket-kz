import { describe, expect, it } from "vitest";
import { connectorStatusLabel } from "./connector-status";

describe("supplier connector status", () => {
  it("keeps live readiness explicit", () => {
    expect(connectorStatusLabel("READY")).toBe("Готов");
    expect(connectorStatusLabel("CONNECTOR_NEEDED")).toBe("Нужно подключение");
    expect(connectorStatusLabel("unknown")).toBe("Неизвестный статус");
  });
});
