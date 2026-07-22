import { describe, expect, it } from "vitest";

import { safeCatalogMediaSource } from "./catalog-media";

describe("safeCatalogMediaSource", () => {
  it("returns a verified local catalog image", () => {
    expect(
      safeCatalogMediaSource({
        securePath: "/catalog/products/product.webp",
        metadata: {
          exactProductPhoto: true,
          sourceImageUrl: "https://manufacturer.example/product.webp",
        },
      }),
    ).toBe("/catalog/products/product.webp");
  });

  it("does not publish an unverified image", () => {
    expect(
      safeCatalogMediaSource({
        securePath: "/catalog/products/product.webp",
        metadata: { exactProductPhoto: false },
      }),
    ).toBeNull();
  });

  it("rejects placeholders even when they are marked exact", () => {
    expect(
      safeCatalogMediaSource({
        securePath: "/catalog/products/product.webp",
        metadata: {
          exactProductPhoto: true,
          sourceImageUrl: "https://supplier.example/no-image.png",
        },
      }),
    ).toBeNull();
  });

  it("uses the neutral state when no image exists", () => {
    expect(safeCatalogMediaSource(undefined)).toBeNull();
  });
});
