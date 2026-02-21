/**
 * delegate-core.ts
 *
 * Shared types and pure scoring functions for the delegation matching algorithm.
 * Imported by both match-delegate.ts (CLI) and tests/delegation.test.ts (tests).
 *
 * Algorithm defined in: integrations/specs/delegation-spec.md
 */

export type Relationship = "direct_report" | "peer" | "vendor" | "partner";
export type CapacitySignal = "high" | "medium" | "low";

export interface Stakeholder {
  name: string;
  alias: string | string[];  // string[] preferred: alias[0] = display, rest = lookup terms
  role: string;
  relationship: Relationship;
  domains: string[];
  capacity_signal: CapacitySignal;
  contact_hint?: string;
  notes?: string;
}

/**
 * Returns the display alias for a stakeholder.
 * If alias is an array, the first item is the display name.
 * If alias is a string (legacy), it is returned as-is.
 */
export function getDisplayAlias(s: Stakeholder): string {
  return Array.isArray(s.alias) ? s.alias[0] : s.alias;
}

/**
 * Given a raw name string (from user input, email, or Slack),
 * returns the display alias of the first matching stakeholder, or null.
 *
 * Matching: case-insensitive, exact token match against all alias entries.
 * Backward compatible: string aliases are treated as single-item arrays.
 */
export function resolveAlias(
  input: string,
  stakeholders: Stakeholder[]
): string | null {
  const normalized = input.trim().toLowerCase();
  for (const s of stakeholders) {
    const entries = Array.isArray(s.alias) ? s.alias : [s.alias];
    for (const entry of entries) {
      if (entry.trim().toLowerCase() === normalized) {
        return getDisplayAlias(s);
      }
    }
  }
  return null;
}

export interface StakeholderFile {
  stakeholders: Stakeholder[];
}

export interface ScoredCandidate {
  alias: string;
  role: string;
  relationship: Relationship;
  capacity_signal: CapacitySignal;
  score: number;
  matched_domains: string[];
  capacity_warning: boolean;
  notes?: string;
}

export interface MatchResult {
  status: "match" | "no_match" | "no_graph" | "empty_graph";
  candidates: ScoredCandidate[];
  message: string;
}

export const WEIGHTS = {
  domain_match: 3,
  relationship: { direct_report: 2, peer: 1, vendor: 0, partner: 0 } as Record<Relationship, number>,
  capacity: { high: 2, medium: 1, low: -1 } as Record<CapacitySignal, number>,
};

export const REL_RANK: Record<Relationship, number> = {
  direct_report: 2, peer: 1, vendor: 0, partner: 0,
};

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

export function scoreDelegate(
  stakeholder: Stakeholder,
  taskTitle: string,
  taskDescription: string
): ScoredCandidate {
  const searchText = normalizeText(`${taskTitle} ${taskDescription}`);
  const matchedDomains: string[] = [];
  let score = 0;
  for (const domain of stakeholder.domains ?? []) {
    if (searchText.includes(normalizeText(domain))) {
      score += WEIGHTS.domain_match;
      matchedDomains.push(domain);
    }
  }
  score += WEIGHTS.relationship[stakeholder.relationship] ?? 0;
  score += WEIGHTS.capacity[stakeholder.capacity_signal] ?? 0;
  return {
    alias: getDisplayAlias(stakeholder),
    role: stakeholder.role,
    relationship: stakeholder.relationship,
    capacity_signal: stakeholder.capacity_signal,
    score,
    matched_domains: matchedDomains,
    capacity_warning: stakeholder.capacity_signal === "low",
    notes: stakeholder.notes,
  };
}

export function rankCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (REL_RANK[b.relationship] ?? 0) - (REL_RANK[a.relationship] ?? 0);
  });
}

export function runMatch(
  stakeholders: Stakeholder[],
  title: string,
  desc = ""
): { status: MatchResult["status"]; candidates: ScoredCandidate[] } {
  if (stakeholders.length === 0) return { status: "empty_graph", candidates: [] };
  const scored = stakeholders.map((s) => scoreDelegate(s, title, desc));
  const ranked = rankCandidates(scored);
  const viable = ranked.filter((c) => c.score > 0);
  if (viable.length === 0) return { status: "no_match", candidates: [] };
  const topScore = viable[0].score;
  const candidates = viable.filter((c) => c.score >= topScore - 2).slice(0, 3);
  return { status: "match", candidates };
}