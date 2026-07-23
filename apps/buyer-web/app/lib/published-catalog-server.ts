import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

export type PublishedCatalogVariant = {
  id: string;
  sku: string | null;
  gtin: string | null;
  label: string;
  attributes?: Record<string, unknown>;
};

export type PublishedCatalogProduct = {
  id: string;
  canonicalProductId?: string;
  name: string;
  description?: string | null;
  brand: string | null;
  manufacturer: string | null;
  category: string;
  sourceUrl?: string | null;
  sourceUpdatedAt?: string | null;
  imageUrl?: string | null;
  placement?: "catalog" | "promotion";
  photoStatus?: string;
  catalogSource?: string;
  complianceClassification?: string;
  moderationWarnings?: string[];
  attributes?: Array<[string, string]>;
  variants: PublishedCatalogVariant[];
  offers: [];
  minNormalizedPriceMinor: null;
  isAvailable: false;
};

type PublishedCatalog = {
  generatedAt: string;
  products: PublishedCatalogProduct[];
};

const catalogCandidates = [
  path.join(process.cwd(), "app/data/production-approved-catalog.json"),
  path.join(
    process.cwd(),
    "apps/buyer-web/app/data/production-approved-catalog.json",
  ),
];

export const readPublishedCatalog = cache(
  async (): Promise<PublishedCatalog> => {
    for (const candidate of catalogCandidates) {
      try {
        return JSON.parse(await fs.readFile(candidate, "utf8")) as PublishedCatalog;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        ) {
          throw error;
        }
      }
    }
    throw new Error("Published catalog data is unavailable");
  },
);
