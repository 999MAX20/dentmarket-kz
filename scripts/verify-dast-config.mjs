const target = process.env.DAST_BASE_URL;
if (!target) {
  console.error("DAST_BASE_URL is required for a live DAST run");
  process.exit(2);
}
const url = new URL(target);
if (url.protocol !== "https:") {
  console.error("DAST target must use HTTPS");
  process.exit(2);
}
if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  console.error("DAST target must not be localhost");
  process.exit(2);
}
console.log(
  JSON.stringify(
    {
      target: url.origin,
      authenticationConfigured: Boolean(process.env.DAST_AUTH_HEADER),
      safeTarget: true,
    },
    null,
    2,
  ),
);
