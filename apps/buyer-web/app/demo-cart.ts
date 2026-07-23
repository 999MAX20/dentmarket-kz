export const DEMO_CART_KEY = "dentmarket:demo-cart";
export const DEMO_CART_UPDATED_EVENT = "dentmarket:demo-cart-updated";

export type DemoCartItem = {
  id: string;
  offerId: string;
  productId: string;
  productName: string;
  supplierName: string;
  priceMinor: string;
  currency: string;
  packaging: string;
  quantity: number;
};

export function readDemoCart(): DemoCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_CART_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DemoCartItem =>
        item &&
        typeof item.id === "string" &&
        typeof item.offerId === "string" &&
        typeof item.productId === "string" &&
        typeof item.productName === "string" &&
        typeof item.supplierName === "string" &&
        typeof item.priceMinor === "string" &&
        typeof item.currency === "string" &&
        typeof item.quantity === "number" &&
        item.quantity > 0,
    );
  } catch {
    return [];
  }
}

export function writeDemoCart(items: DemoCartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(DEMO_CART_UPDATED_EVENT));
}

export function addDemoCartItem(item: Omit<DemoCartItem, "quantity">, quantity = 1) {
  const items = readDemoCart();
  const existing = items.find((current) => current.offerId === item.offerId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ ...item, quantity });
  }
  writeDemoCart(items);
  return items;
}

export function setDemoCartQuantity(itemId: string, quantity: number) {
  const items = readDemoCart().flatMap((item) =>
    item.id === itemId && quantity <= 0
      ? []
      : item.id === itemId
        ? [{ ...item, quantity }]
        : [item],
  );
  writeDemoCart(items);
  return items;
}

export function demoCartCount(items = readDemoCart()) {
  return items.reduce((total, item) => total + item.quantity, 0);
}
