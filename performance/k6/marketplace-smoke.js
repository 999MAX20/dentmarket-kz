import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<750"],
  },
};
const base = (__ENV.BASE_URL || "https://api.example.kz").replace(/\/$/, "");
export default function () {
  const response = http.get(`${base}/api/health`, {
    headers: __ENV.AUTH_TOKEN
      ? { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` }
      : {},
  });
  check(response, {
    "health responds": (res) => res.status >= 200 && res.status < 300,
  });
  sleep(1);
}
