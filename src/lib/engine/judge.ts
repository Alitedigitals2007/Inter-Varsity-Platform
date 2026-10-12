// Server-side answer judging. Answer keys never leave the server before
// an authorized reveal.

export type JudgeableQuestion = {
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_TEXT" | "NUMERICAL" | "SUBJECTIVE";
  answerKey: string | null;
  acceptedAlternatives: string[];
  numericTolerance: number | null;
  options?: { id: string; text: string; isCorrect: boolean }[];
};

export type JudgeOptions = {
  caseSensitive: boolean;
  trimWhitespace: boolean;
  partialMatch: boolean;
};

export type JudgeResult = {
  correct: boolean;
  reason: string;
};

function normalizeText(value: string, opts: JudgeOptions): string {
  let v = value;
  if (opts.trimWhitespace) v = v.trim().replace(/\s+/g, " ");
  if (!opts.caseSensitive) v = v.toLowerCase();
  return v;
}

const TRUE_SET = new Set(["true", "t", "yes", "y", "1"]);
const FALSE_SET = new Set(["false", "f", "no", "n", "0"]);

/**
 * Judge a submitted answer against the protected answer key.
 * For multiple choice, `submitted` should be the selected option id; we also
 * accept the option text (verbal answers recorded by the Game Master).
 */
export function judgeAnswer(
  question: JudgeableQuestion,
  submitted: string,
  opts: JudgeOptions
): JudgeResult {
  const raw = (submitted ?? "").trim();
  if (!raw) return { correct: false, reason: "empty" };

  if (question.type === "SUBJECTIVE") {
    return { correct: false, reason: "requires_manual_judgment" };
  }

  if (question.type === "MULTIPLE_CHOICE" && question.options?.length) {
    const selected = question.options.find((o) => o.id === raw);
    if (selected) {
      return selected.isCorrect
        ? { correct: true, reason: "option_id" }
        : { correct: false, reason: "option_id" };
    }
    const wanted = normalizeText(raw, opts);
    const match = question.options.find((o) => normalizeText(o.text, opts) === wanted);
    if (match) {
      return match.isCorrect
        ? { correct: true, reason: "option_text" }
        : { correct: false, reason: "option_text" };
    }
    return { correct: false, reason: "unknown_option" };
  }

  const key = question.answerKey ?? "";
  const want = normalizeText(key, opts);
  const got = normalizeText(raw, opts);

  if (question.type === "TRUE_FALSE") {
    const g = got.toLowerCase();
    if (!TRUE_SET.has(g) && !FALSE_SET.has(g)) {
      return { correct: false, reason: "not_boolean" };
    }
    const k = want.toLowerCase();
    const asBool = (v: string) => TRUE_SET.has(v);
    return asBool(g) === asBool(k)
      ? { correct: true, reason: "boolean" }
      : { correct: false, reason: "boolean" };
  }

  if (question.type === "NUMERICAL") {
    const n = Number(got.replace(",", "."));
    const k = Number(want.replace(",", "."));
    if (Number.isNaN(n) || Number.isNaN(k)) {
      return { correct: false, reason: "not_numeric" };
    }
    const tol = Math.abs(question.numericTolerance ?? 0);
    return Math.abs(n - k) <= tol
      ? { correct: true, reason: "numeric" }
      : { correct: false, reason: "numeric" };
  }

  // SHORT_TEXT (and fallback for anything else)
  if (got === want) return { correct: true, reason: "exact" };
  for (const alt of question.acceptedAlternatives ?? []) {
    if (got === normalizeText(alt, opts)) return { correct: true, reason: "alternative" };
  }
  if (opts.partialMatch && want && (got.includes(want) || want.includes(got))) {
    return { correct: true, reason: "partial" };
  }
  return { correct: false, reason: "mismatch" };
}
