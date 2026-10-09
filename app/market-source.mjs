// The marketplace UI used to be one file, and many checks read that file's
// source. It is now Marketplace.jsx plus the screens split out of it; this
// returns them as one text so every check still looks at all of it.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MARKET_FILES = ["src/Marketplace.jsx",
  ...["src/market", "src/pages"].flatMap((d) => existsSync(join(here, d))
    ? readdirSync(join(here, d)).filter((f) => f.endsWith(".jsx")).sort().map((f) => `${d}/${f}`)
    : [])];

export function marketSource() {
  return MARKET_FILES.map((f) => readFileSync(join(here, f), "utf8")).join("\n");
}
