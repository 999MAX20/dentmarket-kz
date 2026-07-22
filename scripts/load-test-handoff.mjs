#!/usr/bin/env node

const baseUrl = process.env.LOAD_TEST_BASE_URL;
const userId = process.env.LOAD_TEST_USER_ID;
const organizationId = process.env.LOAD_TEST_ORGANIZATION_ID;
const sessionId = process.env.LOAD_TEST_SESSION_ID;
if (!baseUrl || !userId || !organizationId || !sessionId) {
  throw new Error("Set LOAD_TEST_BASE_URL, LOAD_TEST_USER_ID, LOAD_TEST_ORGANIZATION_ID and LOAD_TEST_SESSION_ID");
}

const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 50);
const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY ?? 5));
const endpoint = new URL("/api/auth/handoff", baseUrl).toString();
let next = 0;
let failures = 0;
const latencies = [];

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requests) return;
    const start = performance.now();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": userId, "x-organization-id": organizationId, "x-session-id": sessionId },
        body: JSON.stringify({ capability: "BUYER" }),
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      latencies.push(performance.now() - start);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
console.log(JSON.stringify({ endpoint, requests, concurrency, failures, p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(percentile(0.95)), p99Ms: Math.round(percentile(0.99)) }, null, 2));
if (failures > 0) process.exitCode = 1;
