import { describe, expect, it } from "vitest";
import { DocumentRendererService } from "./document-renderer.service";

describe("document renderer", () => {
  const renderer = new DocumentRendererService();

  it("renders Cyrillic transaction data to a real PDF", async () => {
    const result = await renderer.render("PDF", "Счёт", "Покупатель: {{buyer.name}}", { buyer: { name: "Стоматология Алматы" } });
    expect(result.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.byteLength).toBeGreaterThan(1_000);
  });

  it("renders a DOCX zip package", async () => {
    const result = await renderer.render("DOCX", "Спецификация", "Заказ: {{order.number}}", { order: { number: "SO-100" } });
    expect(result.subarray(0, 2).toString()).toBe("PK");
    expect(result.byteLength).toBeGreaterThan(1_000);
  });
});
