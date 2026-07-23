import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const pdfDir = path.resolve("tmp/pdfs");
const imageDir = path.join(pdfDir, "iqdent-instrument-all");
const sources = [
  ["https://iqdent.pl/wp-content/uploads/2025/01/iqdent_katalog_web.pdf", path.join(pdfDir, "iqdent-burs-official-catalog.pdf")],
  ["https://iqdent.pl/wp-content/uploads/2025/01/AKTUALNY_KATALOG_IQ_03.01_web.pdf", path.join(pdfDir, "iqdent-official-catalog.pdf")],
];
await fs.mkdir(pdfDir, { recursive: true });
await fs.mkdir(imageDir, { recursive: true });
const forceRefresh = process.argv.includes("--refresh");
let downloadedOfficialPdfs = 0;
for (const [url, output] of sources) {
  if (!forceRefresh) {
    try { if ((await fs.stat(output)).size > 1_000_000) continue; } catch {}
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" } });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  await fs.writeFile(output, Buffer.from(await response.arrayBuffer()));
  downloadedOfficialPdfs += 1;
}
await execFileAsync("pdftoppm", ["-f", "6", "-l", "42", "-jpeg", "-r", "220", sources[1][1], path.join(imageDir, "page")], { maxBuffer: 8 * 1024 * 1024 });
console.log(JSON.stringify({ officialPdfs: sources.length, downloadedOfficialPdfs, renderedInstrumentPages: 37 }, null, 2));
