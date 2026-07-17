import { createHmac } from "node:crypto";

const base = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const actorId = "00000000-0000-4000-8000-000000000002";
const organizationId = "00000000-0000-4000-8000-000000000001";
const headers = { "content-type": "application/json", "x-user-id": actorId, "x-organization-id": organizationId };

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed with ${response.status}: ${text}`);
  return { response, payload };
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, at = Date.now()) {
  const counter = BigInt(Math.floor(at / 30_000));
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const health = await request("/health");
if (!health.response.headers.get("x-request-id")) throw new Error("Request ID header is missing");
for (const dimension of ["ip", "user", "tenant"]) if (!health.response.headers.get(`x-ratelimit-limit-${dimension}`)) throw new Error(`${dimension} rate limit header is missing`);
if (health.response.headers.get("x-content-type-options") !== "nosniff") throw new Error("Security headers are missing");

const enrollment = (await request("/identity/mfa/totp/enroll", { method: "POST", body: "{}" })).payload;
if (!enrollment.secret || enrollment.recoveryCodes?.length !== 10 || !enrollment.otpauthUri?.startsWith("otpauth://")) throw new Error("MFA enrollment response is incomplete");
await request("/identity/mfa/totp/verify", { method: "POST", body: JSON.stringify({ code: totp(enrollment.secret) }) });
const challenge = (await request("/identity/mfa/challenge", { method: "POST", body: JSON.stringify({ code: enrollment.recoveryCodes[0] }) })).payload;
if (!challenge.verified || challenge.method !== "RECOVERY_CODE" || challenge.recoveryCodesRemaining !== 9) throw new Error("Recovery challenge did not consume exactly one code");
await request("/identity/mfa/disable", { method: "POST", body: JSON.stringify({ code: totp(enrollment.secret) }) });
const status = (await request("/identity/mfa")).payload;
if (status.enabled) throw new Error("MFA factor remained enabled after disable");

console.log(JSON.stringify({ securityHeaders: true, requestId: true, rateLimits: ["ip", "user", "tenant"], mfaEnrollment: true, mfaChallenge: challenge.method, mfaDisabled: true }, null, 2));
