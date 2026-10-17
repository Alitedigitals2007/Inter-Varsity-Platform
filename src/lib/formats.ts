// Competition format presets — explained plainly so the admin picks the
// right one. The engine tracks scores; qualification/elimination per round
// is marked by the GM on the scoreboard (QualificationStatus on MatchSchool).

export const FORMAT_PRESETS: Record<string, { label: string; blurb: string }> = {
  LEAGUE_ROUNDS: {
    label: "League of rounds",
    blurb:
      "All schools play every round. Scores accumulate round after round — the highest total at the end wins. Best for 3–6 schools where nobody should go home early.",
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
