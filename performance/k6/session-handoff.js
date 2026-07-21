import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};
export default function () {
  if (!__ENV.HANDOFF_CODE) return;
  const response = http.post(
    `${__ENV.BASE_URL.replace(/\/$/, "")}/api/auth/handoff/exchange`,
    JSON.stringify({ handoffCode: __ENV.HANDOFF_CODE }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(response, {
    "single-use code is enforced": (res) => [200, 401].includes(res.status),
  });
}
