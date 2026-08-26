import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// Guards against the class of bug that broke a real release: a migration
// file's byte content silently drifting after it already shipped (line
// endings, a stray edit) causes sqlx to reject it as "previously applied
// but modified" on every already-installed copy of the app, with no
// warning at build time. This locks each migration's SHA-384 (the same
// algorithm sqlx itself uses) into a committed manifest, so any drift on an
// already-shipped migration fails the build loudly instead of shipping.
const MIGRATIONS_DIR = "src-tauri/migrations";
const MANIFEST_PATH = `${MIGRATIONS_DIR}/checksums.json`;
const write = process.argv.includes("--write");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const current = {};
for (const file of files) {
  current[file] = createHash("sha384").update(readFileSync(`${MIGRATIONS_DIR}/${file}`)).digest("hex");
}

if (write) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`Wrote ${MANIFEST_PATH} with ${files.length} migration(s).`);
  process.exit(0);
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(
    `${MANIFEST_PATH} does not exist. Run 'node scripts/verify-migrations.mjs --write' once and commit it.`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const changed = [];
for (const file of files) {
  if (manifest[file] && manifest[file] !== current[file]) {
    changed.push(file);
  }
}

if (changed.length > 0) {
  console.error("Migration file(s) changed after being locked in checksums.json:");
  for (const file of changed) console.error(`  - ${file}`);
  console.error(
    "\nAn already-shipped migration's content must never change (sqlx rejects the mismatch on every " +
      "installed copy of the app). If this file was never actually released yet, run " +
      "'node scripts/verify-migrations.mjs --write' to re-lock it. Otherwise, add a NEW migration instead " +
      "of editing this one.",
  );
  process.exit(1);
}

const newFiles = files.filter((f) => !manifest[f]);
if (newFiles.length > 0) {
  console.log(`New migration(s) not yet locked: ${newFiles.join(", ")}`);
  console.log("Run 'node scripts/verify-migrations.mjs --write' and commit the updated checksums.json.");
}

console.log("Migration checksums OK.");
