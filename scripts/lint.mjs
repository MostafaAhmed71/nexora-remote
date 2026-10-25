import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const paths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");
let errors = 0;
for (const p of paths) {
  if (
    !/\.(ts|tsx|cs|sql|md|yml|yaml|json|css|mjs)$/.test(p) ||
    p === "package-lock.json"
  )
    continue;
  const s = readFileSync(p, "utf8");
  if (/^(<{7}|={7}|>{7})/m.test(s)) {
    console.error(p + ": conflict marker");
    errors++;
  }
  if (/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(s)) {
    console.error(p + ": private key");
    errors++;
  }
}
if (errors) process.exit(1);
console.log("Source hygiene checks passed");
