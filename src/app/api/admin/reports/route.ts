import { handle, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// ── Reports & CSV export (admin / GM) ───────────────────────────
// One uniform shape powers the on-screen table, the printable view and
// the CSV download: { title, columns, rows }.

type Cell = string | number | null;

type ReportTable = { title: string; columns: string[]; rows: Cell[][] };

const REPORTS = ["summary", "standings", "matches", "questions", "corrections", "timers"] as const;
type ReportKind = (typeof REPORTS)[number];

function csvEscape(v: Cell): string {
  let s = v === null || v === undefined ? "" : String(v);
  // formula-injection guard: text cells starting with a formula character
  // are prefixed so spreadsheets treat them as literal text
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(table: ReportTable): string {
  const lines = [table.columns, ...table.rows].map((r) => r.map(csvEscape).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

export const GET = handle(async (req) => {
  await requireStaff();
  const url = new URL(req.url);
  const competitionId = url.searchParams.get("competitionId");
  const roundId = url.searchParams.get("roundId") || undefined;
  const report = (url.searchParams.get("report") ?? "summary") as ReportKind;
  const format = url.searchParams.get("format") ?? "json";

  if (!competitionId) throw new ApiError(400, "competitionId is required", "VALIDATION");
  if (!REPORTS.includes(report)) throw new ApiError(400, "Unknown report", "VALIDATION");

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, name: true, edition: true, status: true },
  });
  if (!competition) throw new ApiError(404, "Competition not found", "NOT_FOUND");

  const matches = await prisma.match.findMany({
    where: { competitionId, ...(roundId ? { roundId } : {}) },
    orderBy: [{ round: { orderIndex: "asc" } }, { matchNumber: "asc" }],
    select: {
      id: true,
      matchNumber: true,
      status: true,
      turnCounter: true,
      round: { select: { name: true, orderIndex: true } },
      schools: {
        orderBy: { turnOrder: "asc" },
        select: {
          schoolId: true,
          score: true,
          correctCount: true,
          qualification: true,
          school: { select: { name: true, abbreviation: true } },
        },
      },
    },
  });

  const matchIds = matches.map((m) => m.id);
  let table: ReportTable;

  switch (report) {
    case "summary": {
      const grouped = new Map<string, { name: string; order: number; matches: number; completed: number; turns: number; points: number }>();
      for (const m of matches) {
        const key = m.round.name;
        const agg = grouped.get(key) ?? { name: key, order: m.round.orderIndex, matches: 0, completed: 0, turns: 0, points: 0 };
        agg.matches += 1;
        if (m.status === "COMPLETED" || m.status === "ARCHIVED") agg.completed += 1;
        agg.turns += m.turnCounter;
        agg.points += m.schools.reduce((s, x) => s + x.score, 0);
        grouped.set(key, agg);
      }
      const rows = [...grouped.values()]
        .sort((a, b) => a.order - b.order)
        .map((g) => [g.name, g.matches, g.completed, g.turns, g.points]);
      rows.push(["TOTAL", matches.length, rows.reduce((s, r) => s + Number(r[2]), 0), rows.reduce((s, r) => s + Number(r[3]), 0), rows.reduce((s, r) => s + Number(r[4]), 0)]);
      table = {
        title: `${competition.name} — event summary`,
        columns: ["Round", "Matches", "Completed", "Turns played", "Points scored"],
        rows,
      };
      break;
    }

    case "standings": {
      const agg = new Map<string, { name: string; abbr: string | null; matches: number; score: number; correct: number; qualification: string; order: number }>();
      for (const m of matches) {
        for (const ms of m.schools) {
          const key = `${ms.school.name}`;
          const a = agg.get(key) ?? {
            name: ms.school.name,
            abbr: ms.school.abbreviation,
            matches: 0,
            score: 0,
            correct: 0,
            qualification: ms.qualification,
            order: m.round.orderIndex,
          };
          a.matches += 1;
          a.score += ms.score;
          a.correct += ms.correctCount;
          // latest match wins for the qualification status
          if (m.round.orderIndex >= a.order) a.qualification = ms.qualification;
          a.order = Math.max(a.order, m.round.orderIndex);
          agg.set(key, a);
        }
      }
      const rows = [...agg.values()]
        .sort((a, b) => b.score - a.score || b.correct - a.correct)
        .map((a, i) => [i + 1, a.name, a.abbr ?? "", a.matches, a.score, a.correct, a.qualification]);
      table = {
        title: `${competition.name} — standings`,
        columns: ["Rank", "School", "Abbrev", "Matches", "Score", "Correct", "Qualification"],
        rows,
      };
      break;
    }

    case "matches": {
      const rows = matches.map((m) => {
        const ranked = [...m.schools].sort((a, b) => b.score - a.score);
        const winner = ranked[0] && ranked.length > 1 && ranked[0].score > ranked[1].score ? ranked[0].school.name : "—";
        return [
          m.round.name,
          m.matchNumber,
          m.status,
          m.schools
            .map((s) => `${s.school.abbreviation ?? s.school.name}: ${s.score}`)
            .join(" · "),
          winner,
          m.schools
            .filter((s) => s.qualification === "QUALIFIED" || s.qualification === "ELIMINATED" || s.qualification === "PENDING")
            .map((s) => `${s.school.abbreviation ?? s.school.name} ${s.qualification}`)
            .join(" · "),
        ];
      });
      table = {
        title: `${competition.name} — match results`,
        columns: ["Round", "Match", "Status", "Scores", "Winner", "Qualification"],
        rows,
      };
      break;
    }

    case "questions": {
      // school names per (matchId, schoolId) for the "selected by" column
      const schoolName = new Map<string, string>();
      for (const m of matches) {
        for (const ms of m.schools) {
          schoolName.set(`${m.id}:${ms.schoolId}`, ms.school.abbreviation ?? ms.school.name);
        }
      }
      const mqs = await prisma.matchQuestion.findMany({
        where: {
          matchId: { in: matchIds },
          OR: [{ selectedBySchoolId: { not: null } }, { answers: { some: {} } }],
        },
        orderBy: [{ matchId: "asc" }, { orderIndex: "asc" }],
        take: 2000,
        select: {
          id: true,
          matchId: true,
          pointValue: true,
          state: true,
          selectedBySchoolId: true,
          match: { select: { matchNumber: true, round: { select: { name: true } } } },
          question: { select: { text: true, category: { select: { name: true } } } },
          answers: {
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: { text: true, verdict: true, school: { select: { name: true } } },
          },
        },
      });
      const sums = await prisma.scoreEvent.groupBy({
        by: ["matchQuestionId"],
        where: { matchId: { in: matchIds }, matchQuestionId: { not: null } },
        _sum: { points: true },
      });
      const sumMap = new Map(sums.map((s) => [s.matchQuestionId ?? "", s._sum.points ?? 0]));
      table = {
        title: `${competition.name} — question-by-question`,
        columns: ["Round", "Match", "Category", "Question", "Points", "Selected by", "State", "Answer", "Verdict", "Awarded"],
        rows: mqs.map((mq) => {
          const ans = mq.answers[0];
          const sel = mq.selectedBySchoolId
            ? (schoolName.get(`${mq.matchId}:${mq.selectedBySchoolId}`) ?? "")
            : "";
          return [
            mq.match.round.name,
            mq.match.matchNumber,
            mq.question.category?.name ?? "",
            mq.question.text.slice(0, 160),
            mq.pointValue,
            sel,
            mq.state,
            ans?.text?.slice(0, 120) ?? "",
            ans?.verdict ?? "",
            sumMap.get(mq.id) ?? 0,
          ];
        }),
      };
      break;
    }

    case "corrections": {
      const events = await prisma.scoreEvent.findMany({
        where: {
          matchId: { in: matchIds },
          type: { in: ["MANUAL_ADJUSTMENT", "ANSWER_CORRECTION", "QUESTION_VOID_REVERSAL", "RESULT_CORRECTION"] },
        },
        orderBy: { createdAt: "asc" },
        take: 1000,
        select: {
          createdAt: true,
          type: true,
          points: true,
          reason: true,
          school: { select: { name: true } },
          match: { select: { matchNumber: true, round: { select: { name: true } } } },
        },
      });
      const quals = await prisma.auditLog.findMany({
        where: {
          action: "QUALIFICATION_SET",
          entityType: "MatchSchool",
          matchId: { in: matchIds },
        },
        orderBy: { createdAt: "asc" },
        take: 1000,
        select: { createdAt: true, actorLabel: true, after: true, reason: true },
      });
      const rows: Cell[][] = [
        ...events.map((e) => [
          e.createdAt.toISOString(),
          `${e.match.round.name} #${e.match.matchNumber}`,
          e.school.name,
          e.type,
          e.points,
          e.reason ?? "",
          "",
        ]),
        ...quals.map((q) => {
          const after = (q.after ?? {}) as Record<string, unknown>;
          return [
            q.createdAt.toISOString(),
            "",
            "",
            "QUALIFICATION_SET",
            "",
            q.reason ?? "",
            `${q.actorLabel}: ${String(after.qualification ?? "")}`,
          ];
        }),
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      table = {
        title: `${competition.name} — corrections & overrides`,
        columns: ["When", "Match", "School", "Type", "Points", "Reason", "Note"],
        rows,
      };
      break;
    }

    case "timers": {
      const events = await prisma.timerEvent.findMany({
        where: { matchId: { in: matchIds } },
        orderBy: { createdAt: "asc" },
        take: 1000,
        select: {
          createdAt: true,
          action: true,
          phase: true,
          previousValueMs: true,
          newValueMs: true,
          reason: true,
          match: { select: { matchNumber: true, round: { select: { name: true } } } },
        },
      });
      table = {
        title: `${competition.name} — timer overrides`,
        columns: ["When", "Match", "Action", "Phase", "Before (s)", "After (s)", "Reason"],
        rows: events.map((e) => [
          e.createdAt.toISOString(),
          `${e.match.round.name} #${e.match.matchNumber}`,
          e.action,
          e.phase ?? "",
          e.previousValueMs !== null ? Math.round(e.previousValueMs / 100) / 10 : "",
          e.newValueMs !== null ? Math.round(e.newValueMs / 100) / 10 : "",
          e.reason ?? "",
        ]),
      };
      break;
    }
  }

  if (format === "csv") {
    const filename = `${competition.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${report}.csv`;
    return new Response(toCsv(table), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return Response.json({
    ok: true,
    data: { competition: { name: competition.name, edition: competition.edition }, report, ...table },
  });
});
