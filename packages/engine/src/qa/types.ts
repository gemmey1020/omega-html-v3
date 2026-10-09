import type { P02_ACCEPTANCE_POLICY } from "../api/types.js";
export type GateStage = "verify" | "quality" | "regression" | "acceptance";
export type QaOutcome = "PASS" | "FAIL" | "NOT_APPLICABLE" | "NEEDS_REVIEW";
export interface QaCheck {
  readonly rule: string;
  readonly outcome: QaOutcome;
}
export interface GateEvidence {
  readonly stage: GateStage;
  readonly artifactHash: string;
  readonly policy: typeof P02_ACCEPTANCE_POLICY;
  readonly checks: readonly QaCheck[];
  readonly acceptance?: "ACCEPTED" | "REJECTED" | "REVIEW_REQUIRED";
}
export interface DecisionExplanation {
  readonly representation: string | null;
  readonly planHash: string;
  readonly reason: string;
}
