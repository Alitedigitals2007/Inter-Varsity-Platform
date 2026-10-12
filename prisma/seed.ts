// Seed script: bootstrap a runnable demo competition.
// Usage: npm run db:seed   (requires DATABASE_URL + `prisma db push` first)

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateAccessCode } from "../src/lib/codes";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding…");

  // ── staff accounts ────────────────────────────────────────
  // The Admin password is pinned to ADMIN_PASSWORD (default "fassaui") on every
  // seed run so a re-seed can never leave a stale/unknown admin credential.
  // Other staff (Game Masters etc.) are created through the Admin dashboard and
  // are left untouched here — see the Users screen.
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "fassaui";
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const gmHash = await bcrypt.hash("gm123456", 10);

  const admin = await prisma.user.upsert({
    where: { loginId: "admin" },
    create: { loginId: "admin", passwordHash: adminHash, name: "Administrator", role: "ADMIN" },
    update: { passwordHash: adminHash, active: true, role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { loginId: "gm" },
    create: { loginId: "gm", passwordHash: gmHash, name: "Game Master", role: "GAME_MASTER" },
    update: {},
  });
  console.log(`  users: admin/${ADMIN_PASSWORD}, gm/gm123456`);

  // ── schools ───────────────────────────────────────────────
  const schoolDefs = [
    { name: "University of Lagos", abbreviation: "UNILAG" },
    { name: "Ahmadu Bello University", abbreviation: "ABU" },
    { name: "University of Ibadan", abbreviation: "UI" },
    { name: "Bayero University Kano", abbreviation: "BUK" },
  ];
  const schools = [];
  for (const def of schoolDefs) {
    const existing = await prisma.school.findFirst({ where: { abbreviation: def.abbreviation } });
    schools.push(
      existing ??
        (await prisma.school.create({
          data: { name: def.name, abbreviation: def.abbreviation, active: true },
        }))
    );
  }
  console.log(`  schools: ${schools.map((s) => s.abbreviation).join(", ")}`);

  // ── categories ────────────────────────────────────────────
  const categoryNames = ["Mathematics", "Physics", "General Knowledge"];
  const categories = [];
  for (const name of categoryNames) {
    categories.push(
      await prisma.category.upsert({ where: { name }, create: { name }, update: {} })
    );
  }

  // ── questions (only if the bank is empty) ─────────────────
  const existingQuestions = await prisma.question.count();
  if (existingQuestions === 0) {
    const qDefs: {
      category: number;
      text: string;
      type: "SHORT_TEXT" | "TRUE_FALSE" | "MULTIPLE_CHOICE" | "NUMERICAL";
      answerKey?: string;
      acceptedAlternatives?: string[];
      numericTolerance?: number;
      defaultPoints: number;
      options?: { text: string; isCorrect: boolean }[];
    }[] = [
      { category: 0, text: "What is the value of π rounded to two decimal places?", type: "SHORT_TEXT", answerKey: "3.14", defaultPoints: 10 },
      { category: 0, text: "Solve for x: 2x + 6 = 14", type: "NUMERICAL", answerKey: "4", defaultPoints: 10 },
      { category: 0, text: "What is the sum of the interior angles of a triangle?", type: "SHORT_TEXT", answerKey: "180", acceptedAlternatives: ["180 degrees", "180°"], defaultPoints: 10 },
      { category: 0, text: "Is 17 a prime number?", type: "TRUE_FALSE", answerKey: "true", defaultPoints: 10 },
      { category: 0, text: "What is the derivative of x²?", type: "SHORT_TEXT", answerKey: "2x", defaultPoints: 20 },
      { category: 1, text: "What is the SI unit of force?", type: "SHORT_TEXT", answerKey: "newton", acceptedAlternatives: ["N"], defaultPoints: 10 },
      { category: 1, text: "What is the speed of light in a vacuum (approx., ×10⁸ m/s)?", type: "NUMERICAL", answerKey: "3", numericTolerance: 0.1, defaultPoints: 20 },
      { category: 1, text: "Which law states that pressure and volume are inversely proportional at constant temperature?", type: "MULTIPLE_CHOICE", defaultPoints: 10, options: [
        { text: "Boyle's law", isCorrect: true },
        { text: "Charles's law", isCorrect: false },
        { text: "Hooke's law", isCorrect: false },
        { text: "Ohm's law", isCorrect: false },
      ] },
      { category: 1, text: "Does an object in free fall (ignoring air resistance) accelerate at approximately 9.8 m/s² on Earth?", type: "TRUE_FALSE", answerKey: "true", defaultPoints: 10 },
      { category: 2, text: "What is the capital of Nigeria?", type: "SHORT_TEXT", answerKey: "Abuja", defaultPoints: 10 },
      { category: 2, text: "Which planet is known as the Red Planet?", type: "MULTIPLE_CHOICE", defaultPoints: 10, options: [
        { text: "Mars", isCorrect: true },
        { text: "Venus", isCorrect: false },
        { text: "Jupiter", isCorrect: false },
        { text: "Saturn", isCorrect: false },
      ] },
      { category: 2, text: "How many continents are there on Earth?", type: "NUMERICAL", answerKey: "7", defaultPoints: 10 },
      { category: 2, text: "What is the chemical symbol for gold?", type: "SHORT_TEXT", answerKey: "Au", defaultPoints: 20 },
      { category: 2, text: "Is the Great Wall of China visible from space with the naked eye?", type: "TRUE_FALSE", answerKey: "false", defaultPoints: 20 },
      { category: 2, text: "In which year did World War II end?", type: "NUMERICAL", answerKey: "1945", defaultPoints: 10 },
      { category: 0, text: "What is the square root of 144?", type: "NUMERICAL", answerKey: "12", defaultPoints: 10 },
      { category: 1, text: "What gas do plants absorb from the atmosphere for photosynthesis?", type: "MULTIPLE_CHOICE", defaultPoints: 10, options: [
        { text: "Carbon dioxide", isCorrect: true },
        { text: "Oxygen", isCorrect: false },
        { text: "Nitrogen", isCorrect: false },
        { text: "Hydrogen", isCorrect: false },
      ] },
      { category: 2, text: "What is the largest ocean on Earth?", type: "SHORT_TEXT", answerKey: "Pacific", acceptedAlternatives: ["Pacific Ocean", "the pacific", "pacific ocean"], defaultPoints: 10 },
      { category: 0, text: "How many degrees are in a right angle?", type: "NUMERICAL", answerKey: "90", defaultPoints: 10 },
      { category: 1, text: "What particle carries the electromagnetic force?", type: "SHORT_TEXT", answerKey: "photon", defaultPoints: 20 },
    ];

    for (const def of qDefs) {
      const q = await prisma.question.create({
        data: {
          text: def.text,
          categoryId: categories[def.category].id,
          type: def.type,
          answerKey: def.answerKey ?? null,
          acceptedAlternatives: def.acceptedAlternatives ?? [],
          numericTolerance: def.numericTolerance ?? null,
          defaultPoints: def.defaultPoints,
          createdById: admin.id,
        },
      });
      if (def.options) {
        await prisma.questionOption.createMany({
          data: def.options.map((o, i) => ({
            questionId: q.id,
            text: o.text,
            isCorrect: o.isCorrect,
            orderIndex: i,
          })),
        });
      }
    }
    console.log(`  questions: ${qDefs.length} created`);
  } else {
    console.log(`  questions: bank already has ${existingQuestions}, skipped`);
  }

  // ── competition + round + match ───────────────────────────
  let competition = await prisma.competition.findFirst({ where: { name: "Inter-Varsity Championship" } });
  if (!competition) {
    competition = await prisma.competition.create({
      data: {
        name: "Inter-Varsity Championship",
        edition: "2026",
        organizer: "Inter-Varsity Organizing Committee",
        venue: "Main Auditorium",
        status: "DRAFT",
        publicViewing: true,
      },
    });

    const round = await prisma.round.create({
      data: {
        competitionId: competition.id,
        name: "Preliminary",
        orderIndex: 0,
        config: {},
        leaderboardEnabled: true,
      },
    });

    const allQuestions = await prisma.question.findMany({
      where: { active: true },
      take: 16,
    });

    const match = await prisma.match.create({
      data: {
        competitionId: competition.id,
        roundId: round.id,
        matchNumber: 1,
        status: "DRAFT",
        selectionMethod: "BOARD",
        config: { turns: { total: 8 } },
        schools: {
          create: schools.map((s, i) => ({ schoolId: s.id, turnOrder: i })),
        },
        questions: {
          create: allQuestions.map((q) => ({
            questionId: q.id,
            pointValue: q.defaultPoints,
          })),
        },
      },
    });
    console.log(`  competition created with round "Preliminary" + match #1 (${allQuestions.length} questions, turns=8)`);
    console.log(`  GM screen: /gm/${match.id}`);
  } else {
    console.log("  competition already exists, skipped");
  }

  // ── access codes ──────────────────────────────────────────
  const existingCodes = await prisma.schoolAccessCode.count({ where: { competitionId: competition.id } });
  if (existingCodes === 0) {
    for (const school of schools) {
      const code = generateAccessCode();
      await prisma.schoolAccessCode.create({
        data: {
          code,
          schoolId: school.id,
          competitionId: competition.id,
          maxDevices: 1,
        },
      });
      console.log(`  access code ${code} → ${school.abbreviation}`);
    }
  } else {
    console.log(`  access codes already exist (${existingCodes}), skipped`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
