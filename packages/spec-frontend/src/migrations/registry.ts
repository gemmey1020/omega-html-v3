import type { JsonValue } from "@omega/contracts";

/** Explicit caller-owned operation, never a compiler plugin or schema override. */
export interface RawMigrationAdapter {
  readonly id: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  /** Receives a deeply frozen parsed JSON model; output is always revalidated. */
  readonly migrate: (value: JsonValue) => unknown;
}

export interface MigrationRegistry {
  readonly adapters: readonly RawMigrationAdapter[];
}

/** Snapshots route metadata without freezing caller arrays, objects or callbacks. */
export function createMigrationRegistry(
  adapters: readonly RawMigrationAdapter[],
): MigrationRegistry {
  const routes = new Set<string>();
  const copied = adapters.map((adapter) => {
    const { id, fromVersion, toVersion, migrate } = adapter;
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      typeof fromVersion !== "string" ||
      !/^[0-9]+\.[0-9]+$/.test(fromVersion) ||
      typeof toVersion !== "string" ||
      !/^[0-9]+\.[0-9]+$/.test(toVersion) ||
      typeof migrate !== "function"
    )
      throw new TypeError(
        "Migration adapters require an identity, exact versions and callback.",
      );
    const route = `${fromVersion}\0${toVersion}`;
    if (routes.has(route)) throw new TypeError("Duplicate migration route.");
    routes.add(route);
    return Object.freeze({ id, fromVersion, toVersion, migrate });
  });
  return Object.freeze({ adapters: Object.freeze(copied) });
}

/** No normative historical Raw schema has been supplied or reviewed. */
export const DEFAULT_MIGRATION_REGISTRY = createMigrationRegistry([]);
