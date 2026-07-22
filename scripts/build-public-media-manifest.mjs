#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = join(projectRoot, "apps/buyer-web/app/data/public-catalog-media.json");
const restBase = "https://tlxxicjzppflpkcgnauo.supabase.co/rest/v1";
const apiKey = JSON.parse(execFileSync("pnpm", ["dlx", "supabase", "projects", "api-keys", "--project-ref", "tlxxicjzppflpkcgnauo"], { encoding: "utf8" })).keys.find((key) => key.id === "service_role").api_key;
const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
const rejectedAsset = (value) => /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image|\/(?:themes?|templates?|assets\/icons?|images?\/icons?)\/)/i.test(String(value ?? ""));

async function restAll(table, query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${restBase}/${table}?${query}`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    if (!response.ok) throw new Error(`${table} ${response.status}: ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const media = await restAll("ProductMedia", "select=id,productId,sourceUrl,normalizedStorageKey,altText,width,height,metadata,status");
const entries = {};
for (const item of media) {
  const sourcePageUrl = item.metadata?.sourcePageUrl;
  const publicPath = item.normalizedStorageKey ? `/${item.normalizedStorageKey}` : item.sourceUrl;
  const sourceImageUrl = item.metadata?.sourceImageUrl ?? item.sourceUrl;
  if (!sourcePageUrl || !publicPath || item.status !== "READY" || item.metadata?.exactProductPhoto !== true || rejectedAsset(sourceImageUrl)) continue;
  try { await access(join(projectRoot, "apps/buyer-web/public", publicPath)); } catch { continue; }
  entries[sourcePageUrl] = {
    id: item.id,
    sourceUrl: sourceImageUrl ?? null,
    securePath: publicPath,
    normalizedStorageKey: item.normalizedStorageKey ?? null,
    altText: item.altText ?? null,
    width: item.width ?? 1200,
    height: item.height ?? 1200,
    metadata: item.metadata ?? null,
  };
}
await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), total: Object.keys(entries).length, entries }, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, total: Object.keys(entries).length }, null, 2));
