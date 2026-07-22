#!/usr/bin/env node

const baseUrl = process.env.LOAD_TEST_BASE_URL;
if (!baseUrl) throw new Error("Set LOAD_TEST_BASE_URL to an explicit test/staging URL");

const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 100);
const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY ?? 10));
const endpoint = new URL("/api/catalog/search?limit=20&q=%D0%BF%D0%B5%D1%80%D1%87%D0%B0%D1%82%D0%BA%D0%B8", baseUrl).toString();
const started = performance.now();
let next = 0;
let failures = 0;
const latencies = [];

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requests) return;
    const start = performance.now();
    try {
      const response = await fetch(endpoint, { headers: { accept: "application/json" } });
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
console.log(JSON.stringify({ endpoint, requests, concurrency, failures, durationMs: Math.round(performance.now() - started), p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(percentile(0.95)), p99Ms: Math.round(percentile(0.99)) }, null, 2));
if (failures > 0) process.exitCode = 1;
