/**
 * The risk classes, in words. The protocol's list is closed (a new class is a protocol
 * change), so this table is complete by construction and `risk.test.ts` checks it stays so.
 * Hot classes are the ones the policy engine will almost always ask about: leaving the
 * workspace, money, credentials, destruction.
 */

import type { RiskClass } from "@chipschat/protocol";

export interface RiskInfo {
  readonly label: string;
  readonly hot: boolean;
}

export const RISK: Readonly<Record<RiskClass, RiskInfo>> = {
  external: { label: "External", hot: true },
  external_communication: { label: "External message", hot: true },
  irreversible: { label: "Not reversible", hot: false },
  destructive: { label: "Destructive", hot: true },
  financial: { label: "Money", hot: true },
  credential: { label: "Credentials", hot: true },
  privacy: { label: "Personal data", hot: false },
  legal: { label: "Legal", hot: false },
};

export function riskLabel(risk: RiskClass): string {
  return RISK[risk].label;
}
