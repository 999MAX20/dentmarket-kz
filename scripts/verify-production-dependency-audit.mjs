import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["audit", "--prod", "--audit-level", "high", "--json"],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  process.stderr.write(result.stderr || result.stdout || "pnpm audit failed\n");
  process.exit(1);
}

const advisories = Object.entries(report.advisories ?? {});
const blocking = [];
const quarantinedMobile = [];

for (const [id, advisory] of advisories) {
  if (!["high", "critical"].includes(advisory.severity)) continue;
  const paths = (advisory.findings ?? []).flatMap((finding) => finding.paths ?? []);
  const mobileOnly = paths.length > 0 && paths.every((path) => path.startsWith("apps__mobile>"));
  const notYetPublishedImageSizeFix =
    advisory.module_name === "image-size" &&
    advisory.patched_versions === ">=2.0.3";

  if (mobileOnly && notYetPublishedImageSizeFix) {
    quarantinedMobile.push({ id, module: advisory.module_name, paths: paths.length });
  } else {
    blocking.push({ id, module: advisory.module_name, severity: advisory.severity, paths });
  }
}

console.log(JSON.stringify({ blocking, quarantinedMobile }, null, 2));
if (quarantinedMobile.length > 0) {
  console.warn(
    "Mobile release remains quarantined until image-size >=2.0.3 is available through the React Native/Metro dependency chain.",
  );
}
if (blocking.length > 0 || result.error) process.exit(1);
