import assert from "node:assert/strict";

/** @typedef {{specifier: string, version: string}} LockEntry */
/** @typedef {{importers?: {"."?: {packageManagerDependencies?: {pnpm?: LockEntry}, devDependencies?: Record<string, LockEntry>}}}} Lock */

/**
 * @param {LockEntry | undefined} entry
 * @param {string} pin
 * @param {string} name
 */
function verifyEntry(entry, pin, name) {
  assert.ok(entry, `${name} lock entry`);
  assert.equal(entry.specifier, pin, `${name} lock specifier`);
  const message = `${name} resolved lock version`;
  assert.equal(typeof entry.version, "string", message);
  const match = entry.version.match(/^(\d+\.\d+\.\d+)(.*)$/);
  assert.ok(match, message);
  let suffix = match[2] ?? "";
  // Validate nested package@exact-version groups before discarding peer suffixes.
  while (suffix) {
    const reduced = suffix.replace(
      /\((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+\)/g,
      "",
    );
    assert.notEqual(reduced, suffix, message);
    suffix = reduced;
  }
  assert.equal(match[1], pin, message);
}

/**
 * Bootstrap importer checks only; no dependency resolution or acquisition.
 * @param {Lock[]} locks
 * @param {{packageManager: string, devDependencies: Record<string, string>}} manifest
 */
export function verifyImporterPins(locks, manifest) {
  const dependencies = locks.find(
    (document) => document.importers?.["."]?.devDependencies,
  )?.importers?.["."]?.devDependencies;
  assert.ok(dependencies, "Dependency lock document");
  verifyEntry(
    locks.find(
      (document) => document.importers?.["."]?.packageManagerDependencies?.pnpm,
    )?.importers?.["."]?.packageManagerDependencies?.pnpm,
    manifest.packageManager.slice(5),
    "pnpm",
  );
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    verifyEntry(dependencies[name], version, name);
  }
}
