import { readFileSync, writeFileSync } from "node:fs";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node scripts/bump-version.mjs <version>");
  process.exit(1);
}

const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf-8");
writeFileSync(
  cargoPath,
  cargo.replace(/^version = ".*"$/m, `version = "${newVersion}"`),
);

console.log(`Bumped to ${newVersion} in package.json and Cargo.toml`);
