import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import {
  isConfidentAutomaticMatch,
  normalizeCatalogText,
  rankVariants,
  type MatchableVariant,
} from "./matching";

const fixtureRelativePath = path.join(
  "data",
  "test-fixtures",
  "supplier-price-variants.csv",
);
const root = [process.cwd(), path.resolve(process.cwd(), "../..")].find(
  (candidate) => fs.existsSync(path.join(candidate, fixtureRelativePath)),
) ?? process.cwd();
const rows = parse(
  fs.readFileSync(
    path.join(root, fixtureRelativePath),
  ),
  { columns: true, skip_empty_lines: true, trim: true },
) as Array<Record<string, string>>;

const product = (
  canonicalName: string,
  brand: string,
  manufacturer: string,
  aliases: string[],
) => ({
  canonicalName,
  brand: { name: brand },
  manufacturer: { name: manufacturer },
  externalMetadata: { catalogAliases: aliases },
});

const variants: MatchableVariant[] = [
  ["755750AN", "Шприц · оттенок A1 · 3.5 г", "Ivoclar Tetric N-Ceram 2"],
  ["755751AN", "Шприц · оттенок A2 · 3.5 г", "Ivoclar Tetric N-Ceram 2"],
  ["755754AN", "Шприц · оттенок A3.5 · 3.5 г", "Ivoclar Tetric N-Ceram 2"],
  ["755817AN", "Шприц · оттенок B1 · 3.5 г", "Ivoclar Tetric N-Ceram 2"],
  ["755818AN", "Шприц · оттенок B2 · 3.5 г", "Ivoclar Tetric N-Ceram 2"],
  ["750813AN", "Шприц · оттенок A1 · 2 г", "Ivoclar Tetric N-Flow 2"],
  ["755966AN", "Шприц · оттенок A2 Dentine · 2 г", "Ivoclar Tetric N-Flow 2"],
  ["66060392", "Шприц · оттенок A1 · 4 г", "Kulzer Charisma Smart"],
  ["66060395", "Шприц · оттенок A3.5 · 4 г", "Kulzer Charisma Smart"],
  ["66060393", "Шприц · оттенок A2 · 4 г", "Kulzer Charisma Smart"],
  ["66060394", "Шприц · оттенок A3 · 4 г", "Kulzer Charisma Smart"],
].map(([sku, label, canonicalName]) => ({
  id: `variant-${sku}`,
  sku,
  externalMetadata: { label, attributes: { Фасовка: label } },
  product: product(
    canonicalName,
    canonicalName.startsWith("Kulzer") ? "Kulzer" : "Ivoclar",
    canonicalName.startsWith("Kulzer") ? "Kulzer GmbH" : "Ivoclar Vivadent AG",
    [canonicalName.replace(/^(?:Kulzer|Ivoclar) /, "")],
  ),
}));

for (const [sku, label, canonicalName] of [
  ["B5343212", "Порошок · оттенок A2 · 12 г", "VITA LUMEX AC Opaque Dentine"],
  ["B5343250", "Порошок · оттенок A2 · 50 г", "VITA LUMEX AC Opaque Dentine"],
  ["B5303912", "Порошок · оттенок 2M2 · 12 г", "VITA LUMEX AC Dentine"],
  ["B5325212", "Порошок · оттенок Opaque-2 · 12 г", "VITA LUMEX AC Opaque"],
  ["BLML250", "Флакон · 250 мл", "VITA LUMEX AC Modelling Liquid"],
  ["BLML50", "Флакон · 50 мл", "VITA LUMEX AC Modelling Liquid"],
  ["B5345312", "Порошок · оттенок A3 · 12 г", "VITA LUMEX AC Dentine"],
]) {
  variants.push({
    id: `variant-${sku}`,
    sku,
    externalMetadata: { label, attributes: { Фасовка: label } },
    product: product(
      canonicalName,
      "VITA",
      "VITA Zahnfabrik H. Rauter GmbH & Co. KG",
      [canonicalName.replace("VITA ", "")],
    ),
  });
}

describe("supplier price readiness fixture", () => {
  it("routes every row and auto-matches at least 90% of verified catalog rows", () => {
    const outcomes = rows.map((row) => {
      const candidates = rankVariants(
        {
          name: row.name,
          normalizedName: normalizeCatalogText(row.name),
          supplierSku: row.supplierSku || null,
          brandText: row.brand || null,
          manufacturerText: row.manufacturer || null,
        },
        variants,
      );
      return {
        externalId: row.externalId,
        expected: row.expectedDisposition,
        actual: isConfidentAutomaticMatch(candidates) ? "AUTO" : "MODERATION",
      };
    });
    expect(
      outcomes.filter((outcome) => outcome.actual !== outcome.expected),
    ).toEqual([]);
    const verified = outcomes.filter((outcome) => outcome.expected === "AUTO");
    expect(
      verified.filter((outcome) => outcome.actual === "AUTO").length /
        verified.length,
    ).toBeGreaterThanOrEqual(0.9);
    expect(
      outcomes.filter((outcome) => outcome.actual === "AUTO").length /
        outcomes.length,
    ).toBeGreaterThanOrEqual(0.9);
  });
});
