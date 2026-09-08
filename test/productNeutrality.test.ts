import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostProductReference = new RegExp(["ii", "os"].join("[-_]?"), "iu");
const skipped = new Set([".git", "dist", "node_modules"]);

for (const file of packageFiles(packageRoot)) {
  const relative = path.relative(packageRoot, file);
  assert.equal(
    hostProductReference.test(relative),
    false,
    `package path must be host-product neutral: ${relative}`
  );
  assert.equal(
    hostProductReference.test(readFileSync(file, "utf8")),
    false,
    `package content must be host-product neutral: ${relative}`
  );
}

function packageFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...packageFiles(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}
