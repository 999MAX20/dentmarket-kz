"use client";

import { Button } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  Cart20Regular,
  Money20Regular,
} from "@fluentui/react-icons";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./commerce-skeleton.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Organization = {
  id: string;
  displayName: string;
  capabilities: Array<{ capability: string }>;
};
type Offer = {
  id: string;
  supplier: { organization: { displayName: string } };
  productVariant: { product: { canonicalName: string } };
  prices: Array<{ amountMinor: string; currency: string }>;
  inventoryBalances: Array<{
    quantityAvailable: string;
    warehouse: { name: string };
  }>;
};
type CartItem = {
  id: string;
  quantity: string;
  unitPriceMinor: string;
  totalPriceMinor: string;
  priceSource: string;
  offer: Offer;
};
type Cart = {
  id: string;
  status: string;
  currency: string;
  items: CartItem[];
  checkout?: { id: string; status: string } | null;
};
type Reservation = { id: string; quantity: string; status: string };
type OrderItem = {
  id: string;
  quantity: string;
  acceptedQuantity: string;
  totalPriceMinor: string;
  status: string;
  reservation?: Reservation | null;
  offer: { productVariant: { product: { canonicalName: string } } };
};
type SupplierOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotalAmountMinor: string;
  supplier: { id: string; displayName: string };
  items: OrderItem[];
};
type Allocation = {
  id: string;
  grossAmountMinor: string;
  platformFeeMinor: string;
  netAmountMinor: string;
  refundedAmountMinor: string;
  payoutStatus: string;
  status: string;
  recipient: { displayName: string };
  payouts?: Payout[];
};
type PaymentIntent = {
  id: string;
  status: string;
  totalAmountMinor: string;
  currency: string;
  allocations: Allocation[];
  attempts: Array<{ id: string; status: string }>;
  sessions?: Array<{ id: string; status: string; checkoutUrl?: string | null }>;
  authorization?: { status: string } | null;
  refunds?: Array<{ id: string; status: string; amountMinor: string }>;
};
type Checkout = {
  id: string;
  status: string;
  totalAmountMinor: string;
  currency: string;
  supplierOrders: SupplierOrder[];
  paymentIntent?: PaymentIntent | null;
};
type LedgerEntry = {
  id: string;
  debitAccount: string;
  creditAccount: string;
  amountMinor: string;
  currency: string;
  createdAt: string;
};
type Payout = {
  id: string;
  paymentAllocationId: string;
  amountMinor: string;
  currency: string;
  status: string;
  merchantAccount: { organization: { displayName: string } };
};
type PaymentReconciliation = {
  id: string;
  status: string;
  externalRef?: string | null;
  detectedAt: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const demoBuyerId =
  process.env.NEXT_PUBLIC_DEMO_BUYER_ORGANIZATION_ID ??
  "00000000-0000-4000-8000-000000000030";

function money(value: string | number, currency = "KZT") {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) / 100);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Активна",
    CHECKED_OUT: "Оформлена",
    COMPLETED: "Завершён",
    PROCESSING: "В обработке",
    FAILED: "Ошибка",
    AWAITING_CONFIRMATION: "Ждёт поставщика",
    CONFIRMED: "Подтверждён",
    PARTIALLY_CONFIRMED: "Частично",
    REJECTED: "Отклонён",
    UNPAID: "Не оплачен",
    PAID: "Оплачен",
    PENDING: "Готов к capture",
    AUTHORIZED: "Авторизован",
    PARTIALLY_CAPTURED: "Частично списан",
    CAPTURED: "Captured",
    PARTIALLY_REFUNDED: "Частичный возврат",
    REFUNDED: "Возвращён",
    SUCCEEDED: "Успешно",
    READY: "К выплате",
    ON_HOLD: "На удержании",
  };
  return labels[status] ?? status;
}

export function CommerceSkeleton() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [buyerId, setBuyerId] = useState(demoBuyerId);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [reconciliation, setReconciliation] = useState<PaymentReconciliation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: { ...adminAuthHeaders(), ...init?.headers },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const detail = Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message;
        throw new Error(detail ?? `API вернул статус ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        organizationData,
        offerData,
        cartData,
        orderData,
        ledgerData,
        payoutData,
        reconciliationData,
      ] = await Promise.all([
        request<Organization[]>("/organizations"),
        request<Offer[]>(`/buyers/${buyerId}/marketplace-offers`),
        request<Cart[]>(`/buyers/${buyerId}/carts`),
        request<SupplierOrder[]>("/supplier-orders"),
        request<LedgerEntry[]>("/ledger?limit=12"),
        request<Payout[]>("/payouts?limit=20"),
        request<PaymentReconciliation[]>("/payment-reconciliation?limit=20"),
      ]);
      setOrganizations(organizationData);
      setOffers(offerData);
      setCarts(cartData);
      setOrders(orderData);
      setLedger(ledgerData);
      setPayouts(payoutData);
      setReconciliation(reconciliationData);
      const latestCheckoutId = cartData.find((cart) => cart.checkout)?.checkout
        ?.id;
      if (latestCheckoutId) {
        const checkoutData = await request<Checkout>(
          `/checkouts/${latestCheckoutId}`,
        );
        if (checkoutData.paymentIntent)
          checkoutData.paymentIntent = await request<PaymentIntent>(
            `/payment-intents/${checkoutData.paymentIntent.id}`,
          );
        setCheckout(checkoutData);
      } else setCheckout(null);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Торговый контур недоступен.",
      );
    } finally {
      setLoading(false);
    }
  }, [buyerId, request]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCart = useMemo(
    () => carts.find(({ status }) => status === "ACTIVE") ?? null,
    [carts],
  );
  const currentOrders =
    checkout?.supplierOrders ??
    orders.filter((order) => order.items.length > 0).slice(0, 4);
  const payment = checkout?.paymentIntent ?? null;
  const buyerOrganizations = organizations.filter(({ capabilities }) =>
    capabilities.some(({ capability }) => capability === "BUYER"),
  );

  async function act(action: () => Promise<unknown>, success: string) {
    setWorking(true);
    try {
      await action();
      await load();
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Операция не выполнена.",
      );
    } finally {
      setWorking(false);
    }
  }

  function createCart() {
    return act(
      () =>
        request(`/buyers/${buyerId}/carts`, {
          method: "POST",
          body: JSON.stringify({ currency: "KZT" }),
        }),
      "Активная корзина готова.",
    );
  }

  function addOffer(event: FormEvent<HTMLFormElement>, offerId: string) {
    event.preventDefault();
    if (!activeCart) {
      setMessage("Сначала создайте активную корзину.");
      return;
    }
    const quantity = Number(new FormData(event.currentTarget).get("quantity"));
    return act(
      () =>
        request(`/carts/${activeCart.id}/items`, {
          method: "POST",
          body: JSON.stringify({ offerId, quantity }),
        }),
      "Цена зафиксирована в snapshot корзины.",
    );
  }

  function reprice() {
    if (!activeCart) return;
    return act(
      () => request(`/carts/${activeCart.id}/reprice`, { method: "POST" }),
      "Snapshot цен пересчитан.",
    );
  }

  function runCheckout() {
    if (!activeCart) return;
    return act(
      () =>
        request(`/carts/${activeCart.id}/checkout`, {
          method: "POST",
          body: JSON.stringify({ idempotencyKey: `checkout-ui-${Date.now()}` }),
        }),
      "Checkout создал отдельный заказ для каждого поставщика и зарезервировал партии.",
    );
  }

  function confirmOrder(order: SupplierOrder, mode: "full" | "partial") {
    const decisions = order.items.map((item) => ({
      itemId: item.id,
      acceptedQuantity:
        mode === "full"
          ? Number(item.quantity)
          : Math.floor(Number(item.quantity) / 2),
    }));
    return act(
      () =>
        request(`/supplier-orders/${order.id}/confirm`, {
          method: "POST",
          body: JSON.stringify({ decisions }),
        }),
      mode === "full"
        ? "Поставщик подтвердил заказ полностью."
        : "Поставщик подтвердил доступное количество, лишний резерв возвращён.",
    );
  }

  function createPayment() {
    if (!checkout) return;
    return act(
      () =>
        request(`/checkouts/${checkout.id}/payment-intents`, {
          method: "POST",
          body: JSON.stringify({
            providerCode: "MOCK",
            idempotencyKey: `payment-ui-${checkout.id}`,
          }),
        }),
      "Payment intent и allocations рассчитаны.",
    );
  }

  function capturePayment() {
    if (!payment) return;
    return act(
      () =>
        request(`/payment-intents/${payment.id}/mock-capture`, {
          method: "POST",
          body: JSON.stringify({ idempotencyKey: `capture-ui-${payment.id}` }),
        }),
      "Mock capture завершён, ledger записан без изменения истории.",
    );
  }

  function createPaymentSession() {
    if (!payment) return;
    return act(
      () =>
        request(`/payment-intents/${payment.id}/sessions`, {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: `session-ui-${payment.id}`,
            returnUrl: "https://buyer.local/payment-return",
          }),
        }),
      "Единая платёжная сессия создана.",
    );
  }

  function authorizePayment() {
    if (!payment) return;
    return act(
      () =>
        request(`/payment-intents/${payment.id}/authorize`, {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: `authorize-ui-${payment.id}`,
          }),
        }),
      "Сумма авторизована у provider adapter.",
    );
  }

  function refundAllocation(
    event: FormEvent<HTMLFormElement>,
    allocationId: string,
  ) {
    event.preventDefault();
    const amountMinor = Number(
      new FormData(event.currentTarget).get("amountMinor"),
    );
    return act(
      () =>
        request(`/payment-allocations/${allocationId}/refunds`, {
          method: "POST",
          body: JSON.stringify({
            amountMinor,
            reason: "Возврат через операционный центр",
            idempotencyKey: `refund-ui-${allocationId}-${Date.now()}`,
          }),
        }),
      "Возврат проведён компенсирующими ledger entries.",
    );
  }

  function processPayout(payoutId: string) {
    return act(
      () =>
        request(`/payouts/${payoutId}/process`, {
          method: "POST",
          body: JSON.stringify({ idempotencyKey: `payout-ui-${payoutId}` }),
        }),
      "Выплата поставщику обработана.",
    );
  }

  function reconcilePayment() {
    if (!payment) return;
    return act(
      () =>
        request(`/payment-intents/${payment.id}/reconcile`, { method: "POST" }),
      "Финансовая сверка завершена.",
    );
  }

  return (
    <section
      id="commerce-skeleton"
      className={styles.section}
      aria-label="Заказы и расчёты"
    >
      <div className={styles.heading}>
        <div>
          <h2>Заказ от корзины до ledger</h2>
          <p>
            Один проверяемый путь: pricing snapshot, split по поставщикам,
            резерв, подтверждение и capture.
          </p>
        </div>
        <div className={styles.toolbar}>
          <label>
            Покупатель
            <select
              value={buyerId}
              onChange={(event) => setBuyerId(event.target.value)}
            >
              {buyerOrganizations.map((buyer) => (
                <option key={buyer.id} value={buyer.id}>
                  {buyer.displayName}
                </option>
              ))}
            </select>
          </label>
          <Button
            icon={<ArrowClockwise20Regular />}
            appearance="outline"
            onClick={() => void load()}
            disabled={working}
          >
            Обновить
          </Button>
        </div>
      </div>

      {message && (
        <div className={styles.notice} role="status">
          {message}
        </div>
      )}
      {loading ? (
        <div className={styles.skeleton} aria-label="Загрузка">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <>
          <div
            className={styles.stageRail}
            aria-label="Состояние торгового пути"
          >
            <div>
              <span>Корзина</span>
              <strong>
                {activeCart
                  ? `${activeCart.items.length} поз.`
                  : carts[0]
                    ? statusLabel(carts[0].status)
                    : "Нет"}
              </strong>
            </div>
            <div>
              <span>Checkout</span>
              <strong>
                {checkout ? statusLabel(checkout.status) : "Не запущен"}
              </strong>
            </div>
            <div>
              <span>Заказы</span>
              <strong>{currentOrders.length || "Нет"}</strong>
            </div>
            <div>
              <span>Оплата</span>
              <strong>
                {payment ? statusLabel(payment.status) : "Не создана"}
              </strong>
            </div>
          </div>

          <div className={styles.workspace}>
            <div className={styles.procurement}>
              <header className={styles.blockHeader}>
                <div>
                  <h3>Офферы и корзина</h3>
                  <p>Количество повторно проверяется при checkout.</p>
                </div>
                {!activeCart && (
                  <Button
                    icon={<Cart20Regular />}
                    appearance="primary"
                    onClick={() => void createCart()}
                    disabled={working}
                  >
                    Создать корзину
                  </Button>
                )}
              </header>
              <div className={styles.offerList}>
                {offers.length === 0 ? (
                  <div className={styles.empty}>
                    Нет опубликованных офферов со свежим остатком.
                  </div>
                ) : (
                  offers.map((offer) => (
                    <article className={styles.offer} key={offer.id}>
                      <div className={styles.offerCopy}>
                        <strong>
                          {offer.productVariant.product.canonicalName}
                        </strong>
                        <span>{offer.supplier.organization.displayName}</span>
                        <small>
                          {offer.inventoryBalances[0]?.warehouse.name} /
                          доступно{" "}
                          {offer.inventoryBalances[0]?.quantityAvailable ?? 0}
                        </small>
                      </div>
                      <div className={styles.offerPrice}>
                        <strong>
                          {money(
                            offer.prices[0]?.amountMinor ?? 0,
                            offer.prices[0]?.currency,
                          )}
                        </strong>
                        <span>за единицу</span>
                      </div>
                      <form
                        onSubmit={(event) => void addOffer(event, offer.id)}
                      >
                        <label>
                          Кол-во
                          <input
                            name="quantity"
                            type="number"
                            min="1"
                            step="1"
                            defaultValue="2"
                            aria-label={`Количество для ${offer.supplier.organization.displayName}`}
                          />
                        </label>
                        <Button
                          type="submit"
                          appearance="outline"
                          disabled={!activeCart || working}
                        >
                          В корзину
                        </Button>
                      </form>
                    </article>
                  ))
                )}
              </div>

              <div className={styles.cartBlock}>
                <div className={styles.cartTitle}>
                  <div>
                    <h3>Pricing snapshot</h3>
                    <p>
                      {activeCart
                        ? `Корзина ${activeCart.id.slice(0, 8)}`
                        : "Активной корзины нет"}
                    </p>
                  </div>
                  <strong>
                    {money(
                      activeCart?.items.reduce(
                        (sum, item) => sum + Number(item.totalPriceMinor),
                        0,
                      ) ?? 0,
                    )}
                  </strong>
                </div>
                {activeCart?.items.length ? (
                  <div className={styles.cartLines}>
                    {activeCart.items.map((item) => (
                      <div key={item.id}>
                        <span>
                          <b>{item.offer.supplier.organization.displayName}</b>
                          <small>
                            {item.quantity} × {money(item.unitPriceMinor)} /{" "}
                            {item.priceSource}
                          </small>
                        </span>
                        <strong>{money(item.totalPriceMinor)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>
                    Добавьте офферы двух поставщиков, чтобы увидеть split.
                  </div>
                )}
                {activeCart && (
                  <div className={styles.cartActions}>
                    <Button
                      appearance="outline"
                      onClick={() => void reprice()}
                      disabled={working || activeCart.items.length === 0}
                    >
                      Пересчитать
                    </Button>
                    <Button
                      appearance="primary"
                      onClick={() => void runCheckout()}
                      disabled={working || activeCart.items.length === 0}
                    >
                      Оформить
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <aside className={styles.settlement}>
              <div className={styles.orderBlock}>
                <header className={styles.blockHeader}>
                  <div>
                    <h3>Supplier orders</h3>
                    <p>
                      {checkout
                        ? `${money(checkout.totalAmountMinor, checkout.currency)} до подтверждения`
                        : "Checkout ещё не создан"}
                    </p>
                  </div>
                </header>
                {currentOrders.length === 0 ? (
                  <div className={styles.empty}>
                    Заказы появятся после успешного резерва.
                  </div>
                ) : (
                  <div className={styles.orderList}>
                    {currentOrders.map((order) => (
                      <article key={order.id} className={styles.order}>
                        <div className={styles.orderTop}>
                          <span>
                            <strong>{order.supplier.displayName}</strong>
                            <small>{order.orderNumber}</small>
                          </span>
                          <em data-status={order.status}>
                            {statusLabel(order.status)}
                          </em>
                        </div>
                        {order.items.map((item) => (
                          <div className={styles.orderLine} key={item.id}>
                            <span>
                              {item.offer.productVariant.product.canonicalName}
                              <small>
                                Запрошено {item.quantity}, принято{" "}
                                {item.acceptedQuantity} / резерв{" "}
                                {item.reservation?.quantity ?? 0}
                              </small>
                            </span>
                            <b>{money(item.totalPriceMinor)}</b>
                          </div>
                        ))}
                        {order.status === "AWAITING_CONFIRMATION" && (
                          <div className={styles.orderActions}>
                            <Button
                              appearance="outline"
                              onClick={() =>
                                void confirmOrder(order, "partial")
                              }
                              disabled={working}
                            >
                              Частично
                            </Button>
                            <Button
                              appearance="primary"
                              onClick={() => void confirmOrder(order, "full")}
                              disabled={working}
                            >
                              Подтвердить
                            </Button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.paymentBlock}>
                <header className={styles.blockHeader}>
                  <div>
                    <h3>Payment allocations</h3>
                    <p>Комиссия платформы 2%, остаток к выплате поставщику.</p>
                  </div>
                  <Money20Regular />
                </header>
                {!payment ? (
                  <Button
                    appearance="primary"
                    onClick={() => void createPayment()}
                    disabled={
                      working ||
                      !checkout ||
                      currentOrders.some(
                        ({ status }) => status === "AWAITING_CONFIRMATION",
                      )
                    }
                  >
                    Создать payment
                  </Button>
                ) : (
                  <>
                    <div className={styles.paymentSummary}>
                      <span>
                        <small>К оплате</small>
                        <strong>
                          {money(payment.totalAmountMinor, payment.currency)}
                        </strong>
                      </span>
                      <em data-status={payment.status}>
                        {statusLabel(payment.status)}
                      </em>
                    </div>
                    <div className={styles.allocations}>
                      {payment.allocations.map((allocation) => (
                        <div key={allocation.id}>
                          <span>
                            <b>{allocation.recipient.displayName}</b>
                            <small>
                              fee {money(allocation.platformFeeMinor)} / net{" "}
                              {money(allocation.netAmountMinor)} / refund{" "}
                              {money(allocation.refundedAmountMinor ?? 0)}
                            </small>
                            {["CAPTURED", "PARTIALLY_REFUNDED"].includes(
                              allocation.status,
                            ) && (
                              <form
                                className={styles.refundForm}
                                onSubmit={(event) =>
                                  void refundAllocation(event, allocation.id)
                                }
                              >
                                <input
                                  name="amountMinor"
                                  type="number"
                                  min="1"
                                  max={
                                    Number(allocation.grossAmountMinor) -
                                    Number(allocation.refundedAmountMinor ?? 0)
                                  }
                                  placeholder="Сумма, тиын"
                                  required
                                />
                                <Button
                                  size="small"
                                  type="submit"
                                  appearance="outline"
                                  disabled={working}
                                >
                                  Возврат
                                </Button>
                              </form>
                            )}
                          </span>
                          <strong>{money(allocation.grossAmountMinor)}</strong>
                        </div>
                      ))}
                    </div>
                    <div className={styles.paymentActions}>
                      {!payment.sessions?.length && (
                        <Button
                          appearance="outline"
                          onClick={() => void createPaymentSession()}
                          disabled={working}
                        >
                          Создать session
                        </Button>
                      )}
                      {payment.status === "PENDING" && (
                        <Button
                          appearance="outline"
                          onClick={() => void authorizePayment()}
                          disabled={working}
                        >
                          Authorize
                        </Button>
                      )}
                      {["PENDING", "AUTHORIZED"].includes(payment.status) && (
                        <Button
                          appearance="primary"
                          onClick={() => void capturePayment()}
                          disabled={working}
                        >
                          Mock capture
                        </Button>
                      )}
                      <Button
                        appearance="subtle"
                        onClick={() => void reconcilePayment()}
                        disabled={working}
                      >
                        Сверить
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <div className={styles.ledgerBlock}>
                <header>
                  <h3>Payouts и сверка</h3>
                  <span>
                    {reconciliation[0]
                      ? statusLabel(reconciliation[0].status)
                      : "не запускалась"}
                  </span>
                </header>
                {payouts.length === 0 ? (
                  <div className={styles.empty}>
                    Выплаты появятся после capture.
                  </div>
                ) : (
                  <div className={styles.ledgerList}>
                    {payouts.slice(0, 4).map((payout) => (
                      <div key={payout.id}>
                        <span>
                          <b>
                            {payout.merchantAccount.organization.displayName}
                          </b>
                          <small>{statusLabel(payout.status)}</small>
                        </span>
                        {payout.status === "READY" ? (
                          <Button
                            size="small"
                            appearance="outline"
                            onClick={() => void processPayout(payout.id)}
                            disabled={working}
                          >
                            Выплатить
                          </Button>
                        ) : (
                          <strong>
                            {money(payout.amountMinor, payout.currency)}
                          </strong>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.ledgerBlock}>
                <header>
                  <h3>Ledger</h3>
                  <span>{ledger.length} последних записей</span>
                </header>
                {ledger.length === 0 ? (
                  <div className={styles.empty}>
                    Проводки появятся после capture.
                  </div>
                ) : (
                  <div className={styles.ledgerList}>
                    {ledger.slice(0, 6).map((entry) => (
                      <div key={entry.id}>
                        <span>
                          <b>
                            {entry.creditAccount.replace(
                              "payable:supplier:",
                              "supplier:",
                            )}
                          </b>
                          <small>debit {entry.debitAccount}</small>
                        </span>
                        <strong>
                          {money(entry.amountMinor, entry.currency)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
