// Fails if any authored file contains an em dash or en dash.
import fs from "fs";
import path from "path";
const roots = ["src", "scripts", "docs", "contracts/article_registry", "contracts/tip_inbox", "README.md", "HANDOFF.md", ".env.example"];
const bad = [];
// Built from code points so this file never contains the characters it forbids.
const DASHES = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
function walk(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    if (["node_modules", "target", ".snfoundry_cache"].includes(path.basename(p))) return;
    for (const child of fs.readdirSync(p)) walk(path.join(p, child));
    return;
  }
  if (!/\.(ts|tsx|mts|mjs|md|cairo|toml|json|css)$/.test(p)) return;
  const text = fs.readFileSync(p, "utf8");
  text.split("\n").forEach((line, i) => {
    if (DASHES.test(line)) bad.push(`${p}:${i + 1}`);
  });
}
roots.forEach(walk);
if (bad.length) {
  console.error("Em or en dashes found:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("No em or en dashes found.");
