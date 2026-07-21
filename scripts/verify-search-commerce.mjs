const base = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const actorId = "00000000-0000-4000-8000-000000000002";
const operatorOrganizationId = "00000000-0000-4000-8000-000000000001";
const buyerOrganizationId = "00000000-0000-4000-8000-000000000030";
const headers = {
  "content-type": "application/json",
  "x-user-id": actorId,
  "x-organization-id": operatorOrganizationId,
};

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok)
    throw new Error(
      `${options.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`,
    );
  return response.status === 204 ? null : response.json();
}
const post = (path, body) =>
  request(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const put = (path, body) =>
  request(path, { method: "PUT", body: JSON.stringify(body) });

const projection = await post("/marketplace/search/rebuild");
const search = await request(
  `/marketplace/search?buyerOrganizationId=${buyerOrganizationId}&q=${encodeURIComponent("перчатки нитриловые")}&inStock=true&sort=PRICE_ASC`,
);
const gloves = search.items.find(
  ({ slug }) => slug === "safetouch-ultra-nitrile-m-blue-100",
);
if (!gloves || gloves.offers.length < 3)
  throw new Error(
    "Glove product must aggregate offers from at least three suppliers",
  );
const gloveCities = new Set(
  gloves.offers
    .flatMap(({ freshness }) => freshness.map(({ cityId }) => cityId))
    .filter(Boolean),
);
if (gloveCities.size < 3)
  throw new Error("Glove offers must be available from at least three cities");
const comparison = await request(
  `/marketplace/products/${gloves.id}/compare?buyerOrganizationId=${buyerOrganizationId}&quantity=1`,
);
if (comparison.offers.length < 3)
  throw new Error("Comparison must return at least three offers");
const normalized = comparison.offers.map(({ price }) =>
  Number(price.normalizedPriceMinor),
);
if (
  normalized.some((price, index) => index > 0 && price < normalized[index - 1])
)
  throw new Error("Comparison is not sorted by normalized price");
if (comparison.offers.some(({ price }) => Number(price.baseUnits) !== 100))
  throw new Error("Glove comparison lost the 100-piece packaging coefficient");

const supplierId = "00000000-0000-4000-8000-000000000060";
const balanceId = "00000000-0000-4000-8000-000000000182";
const policies = await request(
  `/suppliers/${supplierId}/inventory/freshness/policies`,
);
if (policies.length < 8)
  throw new Error("Global source freshness policies are missing");
const policy = await put(
  `/suppliers/${supplierId}/inventory/freshness/policies`,
  {
    source: "MANUAL",
    dataType: "INVENTORY",
    staleAfterMinutes: 720,
    expirationBehavior: "REQUIRE_CONFIRMATION",
    confirmationRequired: true,
    priority: 10,
  },
);
const override = await post(`/suppliers/${supplierId}/inventory/overrides`, {
  target: "INVENTORY",
  inventoryBalanceId: balanceId,
  mode: "PERMANENT",
  value: { quantityOnHand: 77, quantityReserved: 0, safetyStock: 2 },
  reason: "Сквозная проверка ручной инвентаризации",
});
const overrides = await request(`/suppliers/${supplierId}/inventory/overrides`);
if (
  !overrides.some(({ id, status }) => id === override.id && status === "ACTIVE")
)
  throw new Error("Manual inventory override was not persisted");
await post(
  `/suppliers/${supplierId}/inventory/overrides/${override.id}/cancel`,
);

const cart = await post(`/buyers/${buyerOrganizationId}/carts`, {
  currency: "KZT",
});
for (const offerId of [
  "00000000-0000-4000-8000-000000000150",
  "00000000-0000-4000-8000-000000000160",
  "00000000-0000-4000-8000-000000000170",
  "00000000-0000-4000-8000-000000000210",
])
  await post(`/carts/${cart.id}/items`, { offerId, quantity: 1 });
const checkout = await post(`/carts/${cart.id}/checkout`, {
  idempotencyKey: `four-suppliers-${Date.now()}`,
});
if (checkout.supplierOrders.length !== 4)
  throw new Error(
    `Expected four supplier orders, received ${checkout.supplierOrders.length}`,
  );
if (
  new Set(
    checkout.supplierOrders.map(
      ({ supplierOrganizationId }) => supplierOrganizationId,
    ),
  ).size !== 4
)
  throw new Error("Supplier orders were not split by supplier");

console.log(
  JSON.stringify(
    {
      projection,
      search: {
        total: search.total,
        product: gloves.name,
        offers: gloves.offers.length,
        cities: gloveCities.size,
      },
      comparison: {
        offers: comparison.offers.length,
        normalizedPriceMinor: normalized,
      },
      freshness: {
        globalPolicies: policies.length,
        customPolicyId: policy.id,
        overrideStatusAfterCreate: "ACTIVE",
      },
      commerce: {
        checkoutId: checkout.id,
        supplierOrders: checkout.supplierOrders.length,
      },
    },
    null,
    2,
  ),
);
