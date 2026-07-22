const localLandingUrl = "http://127.0.0.1:3003";
const localSupplierUrl = "http://127.0.0.1:3002";

export const landingAppUrl =
  process.env.NEXT_PUBLIC_LANDING_APP_URL ??
  (process.env.NODE_ENV === "development"
    ? localLandingUrl
    : "https://dentmarket-about.vercel.app");

export const supplierAppUrl =
  process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ??
  (process.env.NODE_ENV === "development"
    ? localSupplierUrl
    : "https://dentmarket-supplier.vercel.app");

export const loginUrl =
  process.env.NEXT_PUBLIC_LOGIN_URL ?? `${landingAppUrl}/login`;

export const registrationUrl = (role: "buyer" | "supplier") =>
  `${landingAppUrl}/register?role=${role}`;
