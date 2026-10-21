// Competition format presets — explained plainly so the admin picks the
// right one. The engine tracks scores; qualification/elimination per round
// is marked by the GM on the scoreboard (QualificationStatus on MatchSchool).

export const FORMAT_PRESETS: Record<string, { label: string; blurb: string }> = {
  CATEGORY_ROUNDS: {
    label: "Rounds by category",
    blurb:
      "Pick the categories first — every category becomes one round, and only its questions appear on the board. All schools play each round; the GM shows the break show and leaderboard between rounds.",
  },
  LEAGUE_ROUNDS: {
    label: "League of rounds",
    blurb:
      "One page. Every category has its own board and the Game Master moves the room to the next category when its turns are complete — scores accumulate to the end.",
  },
  KNOCKOUT: {
    label: "Knockout",
    blurb:
      "After each round, the lowest-ranked schools are eliminated and the survivors advance to the next round. The Game Master marks eliminated schools on the scoreboard after every round.",
  },
  TOP_N_FINAL: {
    label: "Qualify & finals",
    blurb:
      "Preliminary rounds decide the top N schools (e.g. top 4). Those schools qualify — marked on the scoreboard — and face off in a final match for the trophy.",
  },
  POINTS_RACE: {
    label: "Points race",
    blurb:
      "One continuous race: every question in every round adds to a single running total per school. No elimination — the highest running total wins.",
  },
};

export const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(FORMAT_PRESETS).map(([k, v]) => [k, v.label])
);

// ── Structure planner ─────────────────────────────────────────────
// The chosen format + the number of schools determines the rounds and
// matches. The guided setup wizard uses this, so the admin never has to
// hand-build the skeleton.

export type FormatKey =
  | "CATEGORY_ROUNDS"
  | "LEAGUE_ROUNDS"
  | "KNOCKOUT"
  | "TOP_N_FINAL"
  | "POINTS_RACE";

export type PlannedMatch = { schoolIds: string[] };
export type PlannedRound = { name: string; matches: PlannedMatch[] };
export type PlannedStructure = { rounds: PlannedRound[]; notes: string[] };

export const FORMAT_DEFAULTS: Record<
  FormatKey,
  {
    /** How many rounds the format creates up-front (null = single round only). */
    roundsCount: number;
    /** Whether the wizard shows a "rounds" choice. */
    roundsChoosable: boolean;
    defaultQualifyCount: number | null;
    defaultEliminateCount: number | null;
  }
> = {
  CATEGORY_ROUNDS: { roundsCount: 1, roundsChoosable: false, defaultQualifyCount: null, defaultEliminateCount: null },
  LEAGUE_ROUNDS: { roundsCount: 1, roundsChoosable: false, defaultQualifyCount: null, defaultEliminateCount: null },
  KNOCKOUT: { roundsCount: 1, roundsChoosable: false, defaultQualifyCount: 1, defaultEliminateCount: 1 },
  TOP_N_FINAL: { roundsCount: 1, roundsChoosable: true, defaultQualifyCount: null, defaultEliminateCount: null },
  POINTS_RACE: { roundsCount: 1, roundsChoosable: false, defaultQualifyCount: null, defaultEliminateCount: null },
};

/** Groups schools into knockout matchups (pairs; last group of three on odd counts). */
function knockoutGroups(schoolIds: string[]): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < schoolIds.length; i += 2) {
    groups.push(schoolIds.slice(i, i + 2));
  }
  if (schoolIds.length % 2 === 1 && groups.length > 1) {
    const last = groups.pop()!;
    const prev = groups.pop()!;
    groups.push([...prev, ...last]);
  }
  return groups;
}

/**
 * Plans the rounds/matches a format produces for the given (ordered)
 * schools. Knockout creates only round 1 — later rounds are built from
 * qualified schools via the "create next round" action. Qualify & finals
 * creates the preliminaries; the Final is built from qualifiers.
 * Rounds-by-category turns each picked category into one round.
 */
export function planStructure(
  format: FormatKey,
  schoolIds: string[],
  opts: { roundsCount?: number; categoryNames?: string[] } = {}
): PlannedStructure {
  const n = schoolIds.length;
  const rounds: PlannedRound[] = [];
  const notes: string[] = [];

  if (format === "CATEGORY_ROUNDS") {
    const names = (opts.categoryNames ?? []).map((name) => name.trim()).filter(Boolean);
    for (const name of names) {
      rounds.push({ name, matches: [{ schoolIds: [...schoolIds] }] });
    }
    notes.push("Every category is one round — all schools play together and only that category's questions appear on the board.");
    notes.push("When a round ends, the Game Master shows the break show and the leaderboard, then opens the next round.");
    if (n < 2) notes.unshift("Pick at least 2 schools.");
    return { rounds, notes };
  }

  if (n < 2) return { rounds, notes: ["Pick at least 2 schools."] };

  switch (format) {
    case "LEAGUE_ROUNDS": {
      // One page: a single league match where every school plays the same
      // board. "Rounds" are turns, not separate pages.
      rounds.push({ name: "League", matches: [{ schoolIds: [...schoolIds] }] });
      notes.push("One league match on one page — every school plays the same board and scores add up.");
      break;
    }
    case "POINTS_RACE": {
      rounds.push({ name: "Points Race", matches: [{ schoolIds: [...schoolIds] }] });
      notes.push("One continuous race — every question adds to a single running total. Nobody is eliminated.");
      break;
    }
    case "KNOCKOUT": {
      const groups = knockoutGroups(schoolIds);
      rounds.push({ name: "Round 1", matches: groups.map((g) => ({ schoolIds: g })) });
      notes.push(
        n % 2 === 1
          ? "Odd number of schools — one match is a three-way; only its winner advances."
          : "Winners carry a QUALIFIED mark the moment a match ends."
      );
      notes.push("Create the next round from the qualified schools with one click once every match ends.");
      break;
    }
    case "TOP_N_FINAL": {
      const rc = Math.max(1, Math.min(20, opts.roundsCount ?? FORMAT_DEFAULTS.TOP_N_FINAL.roundsCount));
      for (let i = 0; i < rc; i++) {
        rounds.push({
          name: rc === 1 ? "Preliminaries" : `Preliminary ${i + 1}`,
          matches: [{ schoolIds: [...schoolIds] }],
        });
      }
      const finalists = Math.min(4, Math.max(2, n - 1));
      notes.push(`The Final is created automatically once the preliminaries end — the top ${finalists} (or your qualify count) go through.`);
      break;
    }
  }
  return { rounds, notes };
}

// ── Rules text generator ──────────────────────────────────────────
// "The rule determines the rest": the wizard writes a plain-language rules
// sheet from the chosen format + game settings; the admin can edit it.

export function buildRulesText(
  format: FormatKey,
  inputs: {
    schoolCount: number;
    perSchoolTurns: number;
    qualifyCount: number | null;
    eliminateCount: number | null;
    answerSec?: number;
    categories?: { name: string; perSchool: number; boardTotal: number }[];
  }
): string {
  const lines: string[] = [];
  lines.push(`Competition format: ${FORMAT_PRESETS[format].label}.`);

  switch (format) {
    case "CATEGORY_ROUNDS":
      lines.push("• Every round is one category — only that category's questions appear on the board.");
      lines.push("• All schools play every round; scores accumulate across rounds.");
      lines.push("• Between rounds the Game Master plays the break show and the leaderboard.");
      break;
    case "LEAGUE_ROUNDS":
      lines.push("• One match, one page — every category board is played from the same screen.");
      lines.push("• The Game Master moves to the next category once its turns are complete; scores accumulate across categories.");
      lines.push("• The school with the highest total at the end wins.");
      break;
    case "KNOCKOUT":
      lines.push("• Win your match to go through — the winner is marked QUALIFIED automatically.");
      lines.push("• Lose, and your competition is over.");
      lines.push("• When every match in a round ends, the next round is built from the survivors.");
      break;
    case "TOP_N_FINAL":
      lines.push("• The preliminaries decide who advances — the top schools are marked QUALIFIED.");
      lines.push("• Qualified schools meet in the Final for the trophy.");
      break;
    case "POINTS_RACE":
      lines.push("• One continuous race — every question adds to a single running total.");
      lines.push("• Nobody is eliminated; the highest running total wins.");
      break;
  }

  if (inputs.categories && inputs.categories.length > 0) {
    lines.push("Questions by category:");
    for (const c of inputs.categories) {
      lines.push(
        `• ${c.name}: ${c.perSchool} question${c.perSchool === 1 ? "" : "s"} per school (${c.boardTotal} drawn into each match).`
      );
    }
  }
  if (inputs.perSchoolTurns > 0) {
    lines.push(`• Each school gets ${inputs.perSchoolTurns} turn${inputs.perSchoolTurns === 1 ? "" : "s"} per match.`);
  }
  if (inputs.answerSec && inputs.answerSec > 0) {
    lines.push(`• You have ${inputs.answerSec} seconds to answer a question.`);
  }
  if (inputs.qualifyCount !== null && inputs.qualifyCount > 0) {
    lines.push(`• At the end of a match the top ${inputs.qualifyCount} school${inputs.qualifyCount === 1 ? "" : "s"} qualify${inputs.eliminateCount ? ` and the bottom ${inputs.eliminateCount} are eliminated` : ""}.`);
  } else if (inputs.eliminateCount !== null && inputs.eliminateCount > 0) {
    lines.push(`• At the end of a match the bottom ${inputs.eliminateCount} school${inputs.eliminateCount === 1 ? "" : "s"} are eliminated.`);
  }
  return lines.join("\n");
}
