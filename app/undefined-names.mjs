// Every name a component reads is declared, imported, or a browser global.
//
// A JSX file that uses a name it never imported builds without a word and
// throws a ReferenceError only when that branch renders — a sheet nobody
// opened in the tests, a state only a slow network reaches. Splitting the
// 4,500-line Marketplace.jsx into screens is exactly when that happens, so
// this reads every file's scope instead of hoping a test visits every branch.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";
const traverse = traverseMod.default || traverseMod;

const GLOBALS = new Set(Object.getOwnPropertyNames(globalThis).concat([
  "window", "document", "navigator", "location", "localStorage", "sessionStorage",
  "requestAnimationFrame", "cancelAnimationFrame", "IntersectionObserver", "ResizeObserver",
  "MutationObserver", "matchMedia", "getComputedStyle", "Image", "FileReader", "HTMLElement",
  "Node", "Event", "CustomEvent", "KeyboardEvent", "history", "screen", "alert", "confirm",
  "indexedDB", "caches", "Notification", "visualViewport", "devicePixelRatio", "innerWidth",
  "innerHeight", "scrollTo", "open", "close", "print", "OffscreenCanvas", "createImageBitmap",
  "ImageData", "DOMParser", "XMLHttpRequest", "Worker", "self", "import", "arguments",
  "React", "process", "__APP_VERSION__", "__BUILD__", "undefined",
]));

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(jsx|js)$/.test(f) ? [p] : [];
  });
}

export function undefinedNames(root = "src") {
  const found = [];
  for (const f of files(root)) {
    let ast;
    try { ast = parse(readFileSync(f, "utf8"), { sourceType: "module", plugins: ["jsx"] }); }
    catch (e) { found.push(`${f}: does not parse (${e.message})`); continue; }
    traverse(ast, {
      ReferencedIdentifier(path) {
        const n = path.node.name;
        if (path.isJSXIdentifier() && /^[a-z]/.test(n)) return;          // <div>, <span>
        if (path.parentPath.isJSXMemberExpression() && path.parent.object !== path.node) return;
        if (path.scope.hasBinding(n, true) || GLOBALS.has(n)) return;
        found.push(`${f}:${path.node.loc.start.line} ${n}`);
      },
    });
  }
  return [...new Set(found)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const u = undefinedNames();
  console.log(u.length ? u.join("\n") : "no undefined names");
  process.exit(u.length ? 1 : 0);
}
