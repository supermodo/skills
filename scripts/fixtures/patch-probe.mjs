// Patch-path probe — run by scripts/check.ts in a temp tree. Exit 0 = all hold.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPatch, checkPatch, revertPatch } from "../../skills/protocols/scripts/patch.ts";

const root = mkdtempSync(join(tmpdir(), "supermodo-patch-"));
mkdirSync(join(root, "src"));
writeFileSync(join(root, "src/a.ts"), "export const a = 1;\nexport const b = 2;\n");
writeFileSync(join(root, "src/gone.ts"), "old\n");
const snapshot = () => Object.fromEntries(["src/a.ts", "src/gone.ts", "src/new.ts"].map((p) => [p, existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null]));
const before = snapshot();

const failures = [];
const total = { n: 0 };
const expect = (name, cond) => { total.n += 1; if (!cond) failures.push(name); };

// 1. shape errors are named
expect("protected path refused", checkPatch({ files: [{ path: ".git/config", content: "x" }] }).some((e) => /protected/.test(e)));
expect("traversal refused", checkPatch({ files: [{ path: "../x", content: "x" }] }).some((e) => /without/.test(e)));
expect("two modes refused", checkPatch({ files: [{ path: "a", content: "x", delete: true }] }).some((e) => /exactly one/.test(e)));

// 2. a failing block leaves the tree byte-identical (dry-run all before any write)
try {
  applyPatch(root, { files: [{ path: "src/new.ts", content: "new\n" }, { path: "src/a.ts", replace: [{ search: "nope", with: "x" }] }] }, "r1");
  expect("failed apply throws", false);
} catch (e) { expect("failed apply names the block", /found 0 times/.test(String(e))); }
expect("tree untouched after failed apply", JSON.stringify(snapshot()) === JSON.stringify(before));

// 3. a good patch applies atomically and journals
const journal = applyPatch(root, { files: [
  { path: "src/new.ts", content: "new\n" },
  { path: "src/a.ts", replace: [{ search: "const a = 1", with: "const a = 10" }] },
  { path: "src/gone.ts", delete: true },
] }, "r2");
expect("content written", snapshot()["src/new.ts"] === "new\n");
expect("replace applied", /const a = 10/.test(snapshot()["src/a.ts"]));
expect("delete applied", snapshot()["src/gone.ts"] === null);
expect("journal has pre-images", journal.pre.length === 3 && journal.pre[1].content.includes("const a = 1"));

// 4. ambiguous search (matches twice) is refused
try { applyPatch(root, { files: [{ path: "src/a.ts", replace: [{ search: "const", with: "let" }] }] }, "r3"); expect("ambiguous refused", false); }
catch (e) { expect("ambiguous names the count", /found 2 times/.test(String(e))); }

// 5. revert refuses when a patched file was edited since
writeFileSync(join(root, "src/new.ts"), "edited by someone else\n");
const refused = revertPatch(journal);
expect("revert refuses an intervening edit", refused.refused.includes("src/new.ts") && refused.reverted.length === 0);

// 6. revert restores the exact pre-state once the tree matches the journal again
writeFileSync(join(root, "src/new.ts"), "new\n");
const reverted = revertPatch(journal);
expect("revert restores", reverted.refused.length === 0 && JSON.stringify(snapshot()) === JSON.stringify(before));

rmSync(root, { recursive: true, force: true });
failures.forEach((f) => console.error(`patch-probe: FAIL ${f}`));
console.log(`patch-probe: ${total.n - failures.length}/${total.n} expectations hold`);
process.exit(failures.length === 0 ? 0 : 1);
