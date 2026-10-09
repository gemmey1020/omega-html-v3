import { renameSync, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, isAbsolute, join, parse, resolve } from "node:path";
import { sha256 } from "@omega/spec-frontend";
import type { ArtifactCandidate, CommittedArtifact } from "../api/types.js";
import {
  type BuildReceipt,
  isMatchingBuildReceipt,
} from "../receipts/build-receipt.js";
export class OutputAdmissionError extends Error {}
/** Admit lexical paths and every existing ancestor, without following any symlink. */
export async function admitDirectory(
  path: string,
  create = false,
): Promise<string> {
  if (path.split(/[\\/]/).includes(".."))
    throw new OutputAdmissionError("Traversal is unsupported");
  const absolute = resolve(path);
  if (!isAbsolute(absolute))
    throw new OutputAdmissionError("Absolute directory required");
  let cursor = parse(absolute).root;
  const segments = absolute.slice(cursor.length).split("/").filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    cursor = join(cursor, segment);
    let stat: Stats;
    try {
      stat = await lstat(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!create || index !== segments.length - 1)
        throw new OutputAdmissionError("Missing ancestor");
      await mkdir(cursor, { mode: 0o700 });
      stat = await lstat(cursor);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new OutputAdmissionError("Non-real directory");
  }
  return absolute;
}
export async function admitOutput(path: string): Promise<string> {
  const root = await admitDirectory(path, true);
  await admitDirectory(join(root, ".omega-generations"), true);
  const current = join(root, "current");
  let currentStat: Stats;
  try {
    currentStat = await lstat(current);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return root;
    throw error;
  }
  if (!currentStat.isSymbolicLink())
    throw new OutputAdmissionError("Current is not an owned pointer");
  try {
    const link = await readlink(current);
    if (!/^\.omega-generations\/omega-accepted-[A-Za-z0-9_-]+$/.test(link))
      throw new OutputAdmissionError("Unowned pointer");
    const generation = await admitDirectory(join(root, link));
    for (const name of ["artifact.html", "build-receipt.json"]) {
      const file = await lstat(join(generation, name));
      if (!file.isFile() || file.isSymbolicLink())
        throw new OutputAdmissionError("Invalid accepted generation");
    }
    const receipt: unknown = JSON.parse(
      await readFile(join(generation, "build-receipt.json"), "utf8"),
    );
    if (
      !isMatchingBuildReceipt(
        receipt,
        await readFile(join(generation, "artifact.html")),
      )
    )
      throw new OutputAdmissionError("Invalid accepted identity");
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      throw new OutputAdmissionError("Incomplete accepted generation");
    throw error;
  }
  return root;
}
export interface PreparedPublication {
  readonly artifact: CommittedArtifact;
  publish(): CommittedArtifact;
  discard(): Promise<void>;
}
/** Complete immutable generation first; only one same-filesystem pointer rename publishes it. */
export async function preparePublication(
  root: string,
  sourceCandidate: ArtifactCandidate,
  sourceReceipt: BuildReceipt,
): Promise<PreparedPublication> {
  const candidate = Object.freeze({ ...sourceCandidate });
  const receipt = freezeOwned(structuredClone(sourceReceipt));
  if (
    receipt.artifactHash !== candidate.artifactHash ||
    receipt.byteLength !== candidate.byteLength ||
    receipt.gates.acceptance.acceptance !== "ACCEPTED"
  )
    throw new OutputAdmissionError("Receipt does not match accepted candidate");
  await admitOutput(root);
  await admitDirectory(candidate.workspaceDirectory);
  if (
    candidate.workspacePath !==
    join(candidate.workspaceDirectory, "artifact.html")
  )
    throw new OutputAdmissionError("Unconfined candidate");
  const file = await lstat(candidate.workspacePath);
  if (!file.isFile() || file.isSymbolicLink())
    throw new OutputAdmissionError("Candidate is not a real file");
  const generation = await mkdtemp(
    join(root, ".omega-generations/omega-accepted-"),
  );
  const pointer = join(root, `.omega-pointer-${basename(generation)}`);
  try {
    const bytes = await readFile(candidate.workspacePath);
    if (
      sha256(bytes) !== candidate.artifactHash ||
      bytes.length !== candidate.byteLength
    )
      throw new OutputAdmissionError("Stale candidate");
    await writeFile(join(generation, "artifact.html"), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(
      join(generation, "build-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await symlink(`.omega-generations/${basename(generation)}`, pointer);
    const artifact = Object.freeze({
      finalArtifactPath: join(generation, "artifact.html"),
      finalReceiptPath: join(generation, "build-receipt.json"),
      receipt,
    });
    let published = false;
    return {
      artifact,
      publish() {
        renameSync(pointer, join(root, "current"));
        published = true;
        return artifact;
      },
      async discard() {
        if (!published) {
          await rm(pointer, { force: true });
          await rm(generation, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await rm(pointer, { force: true });
    await rm(generation, { recursive: true, force: true });
    throw error;
  }
}

function freezeOwned<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeOwned(child);
    Object.freeze(value);
  }
  return value;
}
