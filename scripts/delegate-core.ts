/**
 * delegate-core.ts
 *
 * Shared types and pure scoring functions for the delegation matching algorithm.
 * Imported by both match-delegate.ts (CLI) and tests/delegation.test.ts (tests).
 *
 * Algorithm defined in: docs/specs/delegation-spec.md
 *
 * Also re-exports adapter contract types so consumers have a single import point.
 */

// Adapter contract — formalizes adapters/README.md
export type { TaskOutputRecord, PushResult } from "./adapter-types";

export type Relationship = "direct_report" | "peer" | "vendor" | "partner";
export type CapacitySignal = "high" | "medium" | "low";

export interface Stakeholder {
  name: string;
  alias: string | string[];  // string[] preferred: alias[0] = display, rest = lookup terms
  role: string;
  relationship: Relationship;
  domains: string[];
  /**
   * Optional hard-veto list. If any anti_domain keyword is found in the task
   * text, this stakeholder is excluded from candidates regardless of domain
   * match or relationship score. Score is set to -Infinity.
   *
   * Use for structural ownership constraints — e.g., a vendor who should
   * never receive internal architecture decisions.
   */
  anti_domains?: string[];
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

/**
 * Per-axis score breakdown for transparency. The sum of (domain,
 * relationship, capacity, pending) equals ScoredCandidate.score for
 * non-vetoed candidates. Vetoed candidates have score = -Infinity; the
 * breakdown still reports would-be component contributions for debugging.
 * Invariants (by construction in scoreDelegate):
 *   - domain      >= 0
 *   - relationship >= 0 (WEIGHTS.relationship has no negative entries)
 *   - capacity    in {-1, 1, 2} (low / medium / high)
 *   - pending     <= 0 (penalty)
 */
export interface ScoreBreakdown {
  domain: number;
  relationship: number;
  capacity: number;
  pending: number;
  vetoed: boolean;
}

/**
 * Sum of breakdown axes — used by scoreDelegate to assign
 * ScoredCandidate.score, and by consumers that need to re-derive the
 * total from a breakdown object (e.g., axis-only renderers that compute
 * totals on the fly). Vetoed candidates return -Infinity regardless of
 * axis values — the axis values report would-be contributions for
 * debugging, but the candidate is structurally excluded.
 */
export function breakdownSum(b: ScoreBreakdown): number {
  if (b.vetoed) return -Infinity;
  return b.domain + b.relationship + b.capacity + b.pending;
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
  /**
   * Per-axis breakdown. Renderers display "domain +6, direct_report +2,
   * capacity high +2" rather than the opaque score. ScoredCandidate.score
   * equals breakdownSum(breakdown) by construction.
   */
  breakdown: ScoreBreakdown;
}

/**
 * MatchResult.status values:
 *   - match          → 1+ viable candidates returned in `candidates`
 *   - no_match       → graph loaded but no candidate scored > 0
 *   - empty_graph    → stakeholders.yaml exists but `stakeholders: []`
 *   - no_graph       → stakeholders.yaml file is missing
 *   - invalid_graph  → stakeholders.yaml present but contains schema /
 *                      validation errors (e.g., unknown relationship or
 *                      capacity_signal enum value). Distinct from no_graph
 *                      so prompts can route the user to fix the typo
 *                      rather than re-creating the file.
 *   - internal_error → an internal invariant violation (e.g., runMatch
 *                      contract broken); `message` carries the detail.
 */
export interface MatchResult {
  status: "match" | "no_match" | "no_graph" | "empty_graph" | "invalid_graph" | "internal_error";
  candidates: ScoredCandidate[];
  message: string;
  /**
   * Score delta between top candidate and runner-up
   * (candidates[0].score - candidates[1].score). null — and only null —
   * when fewer than 2 candidates exist. Renderers must NOT coerce null
   * to 0; the two states are semantically distinct ("no runner-up" vs
   * "tied runner-up").
   */
  runnerUpDelta: number | null;
}

/**
 * Scoring weights — single source of truth for relationship + capacity
 * axes. `satisfies` (not `as`) is load-bearing: adding a member to the
 * `Relationship` or `CapacitySignal` union without adding the matching
 * entry here is a COMPILE ERROR. This is the drift-prevention property
 * that match-delegate.ts's VALID_* derivation relies on.
 *
 * `as Record<...>` would NOT give that guarantee — it permits any object
 * whose keys are a subset of the union.
 */
export const WEIGHTS = {
  domain_match: 3,
  relationship: { direct_report: 2, peer: 1, vendor: 0, partner: 0 },
  capacity: { high: 2, medium: 1, low: -1 },
} satisfies {
  domain_match: number;
  relationship: Record<Relationship, number>;
  capacity: Record<CapacitySignal, number>;
};

/**
 * Relationship rank for tiebreak in rankCandidates. Derived from
 * WEIGHTS.relationship so the relationship axis has ONE source of truth.
 * Same numeric values as the score weights — no parallel literal to drift.
 */
export const REL_RANK: Record<Relationship, number> = WEIGHTS.relationship;

// ── Memory schema constants — single source of truth ─────────────────────────
//
// These mirror docs/specs/memory-schema-spec.md.
// loadPendingCounts() validates the glossary header against GLOSSARY_COLUMNS.
// Commands that write memory rows must use these column names verbatim.
// Changing a column name here is the ONLY place it needs to change.

/** Canonical columns for the Stakeholder Follow-ups table in memory/glossary.md */
export const GLOSSARY_COLUMNS = [
  "Alias", "Task", "Delegated on", "Check-by", "Status",
] as const;

/** Canonical columns for each memory/people/{alias}.md Delegations table */
export const PEOPLE_COLUMNS = [
  "Task", "Delegated on", "Check-by", "Status", "Notes",
] as const;

export type GlossaryColumn = (typeof GLOSSARY_COLUMNS)[number];
export type PeopleColumn   = (typeof PEOPLE_COLUMNS)[number];

/**
 * Returns the 0-based index of a GLOSSARY_COLUMNS entry by name.
 * Used by parsers so column positions are never hardcoded.
 */
export function glossaryColIndex(col: GlossaryColumn): number {
  return GLOSSARY_COLUMNS.indexOf(col);
}

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

/**
 * Penalty applied to score per active pending delegation beyond the threshold.
 * Kept alongside WEIGHTS so all scoring constants live in one place.
 */
export const PENDING_THRESHOLD = 2;
export const PENDING_PENALTY = -2;

export function scoreDelegate(
  stakeholder: Stakeholder,
  taskTitle: string,
  taskDescription: string,
  pendingCount = 0
): ScoredCandidate {
  const searchText = normalizeText(`${taskTitle} ${taskDescription}`);
  const matchedDomains: string[] = [];

  let vetoed = false;
  for (const anti of stakeholder.anti_domains ?? []) {
    if (searchText.includes(normalizeText(anti))) {
      vetoed = true;
      break;
    }
  }

  let domainScore = 0;
  for (const domain of stakeholder.domains ?? []) {
    if (searchText.includes(normalizeText(domain))) {
      domainScore += WEIGHTS.domain_match;
      matchedDomains.push(domain);
    }
  }
  const relationshipScore = WEIGHTS.relationship[stakeholder.relationship] ?? 0;
  const capacityScore = WEIGHTS.capacity[stakeholder.capacity_signal] ?? 0;
  const overload = Math.max(0, pendingCount - PENDING_THRESHOLD);
  // Guard against JS -0 (0 * -2 = -0). renderScorecard's `pending < 0`
  // check would still be correct without this (since -0 < 0 is false),
  // but Object.is(0, -0) is false too — keeping pendingScore strictly
  // +0 avoids `toBe(0)` test surprises and downstream display drift.
  const pendingScore = overload === 0 ? 0 : overload * PENDING_PENALTY;

  const breakdown: ScoreBreakdown = {
    domain: domainScore,
    relationship: relationshipScore,
    capacity: capacityScore,
    pending: pendingScore,
    vetoed,
  };
  const score = breakdownSum(breakdown);

  return {
    alias: getDisplayAlias(stakeholder),
    role: stakeholder.role,
    relationship: stakeholder.relationship,
    capacity_signal: stakeholder.capacity_signal,
    score,
    matched_domains: matchedDomains,
    capacity_warning: stakeholder.capacity_signal === "low" || pendingCount > PENDING_THRESHOLD,
    notes: stakeholder.notes,
    breakdown,
  };
}

export function rankCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // REL_RANK is Record<Relationship, number> — no `?? 0` needed because
    // b.relationship is typed as Relationship, so the lookup cannot miss.
    return REL_RANK[b.relationship] - REL_RANK[a.relationship];
  });
}

export function runMatch(
  stakeholders: Stakeholder[],
  title: string,
  desc = "",
  pendingCounts: Record<string, number> = {}
): { status: MatchResult["status"]; candidates: ScoredCandidate[]; runnerUpDelta: number | null } {
  if (stakeholders.length === 0) {
    return { status: "empty_graph", candidates: [], runnerUpDelta: null };
  }
  const scored = stakeholders.map((s) => {
    const alias = getDisplayAlias(s);
    return scoreDelegate(s, title, desc, pendingCounts[alias] ?? 0);
  });
  const ranked = rankCandidates(scored);
  const viable = ranked.filter((c) => c.score > 0);
  if (viable.length === 0) {
    return { status: "no_match", candidates: [], runnerUpDelta: null };
  }
  // Return top 3 viable candidates unconditionally so renderers can show
  // narrative scorecards even on clear wins. The previous within-2-points
  // filter hid runners-up that calibrate user trust over time.
  const candidates = viable.slice(0, 3);
  const runnerUpDelta = candidates.length >= 2
    ? candidates[0].score - candidates[1].score
    : null;
  return { status: "match", candidates, runnerUpDelta };
}

// ── Authority flag — single source of truth ──────────────────────────────────

/**
 * Phrases that indicate a task requires personal authority and must NOT be
 * delegated. Checked by /delegate (Step 2) and /prioritize (Step 3).
 * Any change here propagates automatically to all consumers.
 */
export const AUTHORITY_PATTERNS: readonly string[] = [
  "requires your sign-off",
  "executive decision",
  "personnel decision",
  "sensitive communication on your behalf",
];

/**
 * Returns true if the combined task title + description contains any authority
 * pattern. Matching is case-insensitive. When true, delegation must be blocked.
 */
export function hasAuthorityFlag(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  return AUTHORITY_PATTERNS.some((p) => combined.includes(p));
}

// ── Q3 delegation record — single source of truth ────────────────────────────

/**
 * Canonical string constants for Q3 task record fields written to TASKS.md.
 * All code that constructs a delegation record must import from here.
 */
export const Q3 = {
  SOURCE:   "Direct delegation",
  REQUESTER: "Self",
  URGENCY:  "Delegated",
  QUADRANT: "Q3 — Delegate if possible",
  ACTION_PREFIX: "Delegated — check in",
} as const;

/** Shape of a Q3 delegation record as written to TASKS.md. */
export interface DelegateTaskRecord {
  title: string;
  description: string;
  source: string;
  requester: string;
  urgency: string;
  quadrant: string;
  delegateTo: string;
  checkinDate: string;
  scheduled: string;
  action: string;
}

/**
 * Constructs a complete Q3 delegation record for writing to TASKS.md.
 * Uses Q3 constants as single source of truth for all fixed field values.
 */
export function buildTaskRecord(
  title: string,
  description: string,
  delegateAlias: string,
  checkinDate: string,
  scheduledDate: string
): DelegateTaskRecord {
  return {
    title,
    description,
    source:     Q3.SOURCE,
    requester:  Q3.REQUESTER,
    urgency:    Q3.URGENCY,
    quadrant:   Q3.QUADRANT,
    delegateTo: delegateAlias,
    checkinDate,
    scheduled:  scheduledDate,
    action:     `${Q3.ACTION_PREFIX} ${checkinDate}`,
  };
}