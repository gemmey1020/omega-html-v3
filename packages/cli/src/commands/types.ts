import type {
  ExecutionControl,
  ExecutionSettings,
  OmegaEngine,
} from "@omega/engine";
export interface CommandContext {
  readonly engine: OmegaEngine;
  readonly control: ExecutionControl;
  readonly source: { readonly module: string; readonly text: Uint8Array };
  readonly output?: string;
  readonly settings?: Pick<ExecutionSettings, "cache" | "diagnostics">;
  readonly targetVersion?: string;
}
