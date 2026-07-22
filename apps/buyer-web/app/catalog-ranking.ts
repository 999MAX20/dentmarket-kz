export type SearchRankOffer = {
  priceMinor: string | null;
  normalizedPriceMinor: string | null;
  available: boolean;
  confirmationMode: string;
  deliveryMethods: string[];
  verifiedDocuments?: boolean;
  officialDistributor?: boolean;
};

export type CompareRankOffer = {
  offerId: string;
  supplier: { organizationId: string };
  price: { normalizedPriceMinor: string };
  availability: Array<{ quantityAvailable: string }>;
  delivery: Array<{
    method: string;
    minLeadTimeHours: number | null;
    maxLeadTimeHours: number | null;
  }>;
  markers: {
    verifiedDocuments: boolean;
    officialDistributor: boolean;
    requiresConfirmation: boolean;
  };
};

const FAST_DELIVERY_METHODS = new Set([
  "CARRIER",
  "NATIONWIDE",
  "SUPPLIER_CITY",
]);

const priceNumber = (value: string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
};

const availableQuantity = (value: string) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed > 0;
  return /в наличии|available/i.test(value);
};

const priceBonus = (price: number, minimum: number) => {
  if (!Number.isFinite(price) || !Number.isFinite(minimum)) return 0;
  return Math.max(0, Math.min(10, (minimum / price) * 10));
};

export const rankSearchOffers = <T extends SearchRankOffer>(offers: T[]) => {
  const priced = offers.filter((offer) => offer.priceMinor);
  const minimum = Math.min(
    ...priced.map((offer) => priceNumber(offer.normalizedPriceMinor ?? offer.priceMinor)),
  );
  return [...offers].sort((left, right) => {
    const score = (offer: T) => {
      const verified = offer.verifiedDocuments ?? true;
      const automatic = offer.confirmationMode !== "MANUAL";
      const fastDelivery = offer.deliveryMethods.some((method) =>
        FAST_DELIVERY_METHODS.has(method),
      );
      const price = priceNumber(offer.normalizedPriceMinor ?? offer.priceMinor);
      return (
        (verified ? 45 : 0) +
        (offer.available ? 30 : 0) +
        (fastDelivery ? 12 : 0) +
        (automatic ? 8 : 0) +
        (offer.officialDistributor ? 4 : 0) +
        priceBonus(price, minimum)
      );
    };
    return (
      score(right) - score(left) ||
      priceNumber(left.normalizedPriceMinor ?? left.priceMinor) -
        priceNumber(right.normalizedPriceMinor ?? right.priceMinor)
    );
  });
};

export const isCompareOfferAvailable = (offer: CompareRankOffer) =>
  !offer.markers.requiresConfirmation &&
  offer.availability.some((item) => availableQuantity(item.quantityAvailable));

export const rankCompareOffers = <T extends CompareRankOffer>(
  offers: T[],
  trust: Record<string, { score: string | null } | undefined>,
) => {
  const minimum = Math.min(
    ...offers.map((offer) => priceNumber(offer.price.normalizedPriceMinor)),
  );
  return [...offers].sort((left, right) => {
    const score = (offer: T) => {
      const available = isCompareOfferAvailable(offer);
      const fastDelivery = offer.delivery.some(
        ({ method, maxLeadTimeHours }) =>
          FAST_DELIVERY_METHODS.has(method) ||
          (maxLeadTimeHours != null && maxLeadTimeHours <= 48),
      );
      const trustScore = Number(trust[offer.supplier.organizationId]?.score ?? 0);
      return (
        (offer.markers.verifiedDocuments ? 45 : 0) +
        (available ? 30 : 0) +
        (fastDelivery ? 12 : 0) +
        (!offer.markers.requiresConfirmation ? 8 : 0) +
        (offer.markers.officialDistributor ? 4 : 0) +
        Math.max(0, Math.min(8, trustScore * 0.08)) +
        priceBonus(priceNumber(offer.price.normalizedPriceMinor), minimum)
      );
    };
    return (
      score(right) - score(left) ||
      priceNumber(left.price.normalizedPriceMinor) -
        priceNumber(right.price.normalizedPriceMinor)
    );
  });
};

export const deliveryLabel = (methods: string[]) => {
  if (methods.includes("NATIONWIDE")) return "Доставка по Казахстану";
  if (methods.includes("CARRIER")) return "Курьерская доставка";
  if (methods.includes("SUPPLIER_CITY")) return "Доставка по городу";
  if (methods.includes("PICKUP")) return "Самовывоз";
  return "Условия доставки уточняются";
};
