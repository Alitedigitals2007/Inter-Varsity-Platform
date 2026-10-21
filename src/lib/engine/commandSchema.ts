import { z } from "zod";

const base = { reason: z.string().min(1).max(500).optional() };

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MATCH_START") }),
  z.object({ type: z.literal("MATCH_PAUSE"), ...base }),
  z.object({ type: z.literal("MATCH_RESUME") }),
  z.object({ type: z.literal("MATCH_END"), ...base }),
  z.object({ type: z.literal("TURN_SKIP"), ...base }),
  z.object({ type: z.literal("TURN_REPEAT"), ...base }),
  z.object({
    type: z.literal("QUESTION_SELECT"),
    matchQuestionId: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    pointValue: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal("QUESTION_REVEAL") }),
  z.object({
    type: z.literal("ANSWER_SUBMIT"),
    text: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal("ANSWER_JUDGE"),
    answerId: z.string().min(1).optional(),
    verdict: z.enum(["CORRECT", "INCORRECT"]),
    note: z.string().max(1000).optional(),
  }),
  z.object({ type: z.literal("RESULT_REVEAL") }),
  z.object({ type: z.literal("NEXT_TURN") }),
  z.object({
    type: z.literal("TIMER_SET"),
    action: z.enum(["START", "PAUSE", "RESUME", "ADD", "REDUCE", "SET", "STOP"]),
    ms: z.number().int().min(0).max(3_600_000).optional(),
    ...base,
  }),
  z.object({ type: z.literal("LEADERBOARD_SET"), visible: z.boolean() }),
  z.object({ type: z.literal("BREAK_SET"), visible: z.boolean() }),
  z.object({
    type: z.literal("SCORE_OVERRIDE"),
    schoolId: z.string().min(1),
    points: z.number().int().min(-10_000).max(10_000),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("QUESTION_VOID"),
    matchQuestionId: z.string().min(1),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("QUALIFICATION_SET"),
    schoolId: z.string().min(1),
    status: z.enum(["QUALIFIED", "ELIMINATED", "NOT_APPLICABLE", "PENDING"]),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("CATEGORY_ADVANCE"),
    categoryId: z.string().min(1),
    reason: z.string().min(1).max(500),
  }),
]);

export type CommandInput = z.infer<typeof commandSchema>;
