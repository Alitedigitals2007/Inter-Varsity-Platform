"use client";

// Question bank (spec §6): categories, single-question entry, bulk import
// with a dry-run preview + error report before anything is saved.

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, ClientApiError } from "@/lib/client";

type Category = { id: string; name: string; _count: { questions: number } };
type Question = {
  id: string;
  text: string;
  type: string;
  answerKey: string | null;
  defaultPoints: number;
  active: boolean;
  category: { id: string; name: string };
  options: { id: string; text: string; isCorrect: boolean }[];
};

type ImportRow = {
  text: string;
  category: string;
  type: string;
  answerKey?: string;
  defaultPoints?: number;
  options?: { text: string; isCorrect: boolean }[];
};

const TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT", "NUMERICAL", "SUBJECTIVE"];

export default function QuestionsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"add" | "import">("add");

  // add-question form
  const [form, setForm] = useState({
    text: "",
    categoryId: "",
    type: "SHORT_TEXT" as string,
    answerKey: "",
    defaultPoints: "10",
    explanation: "",
  });
  const [options, setOptions] = useState<{ text: string; isCorrect: boolean }[]>([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ]);
  const [busy, setBusy] = useState(false);

  // import
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<{ total: number; valid: number; errors: string[] } | null>(null);

  const load = useCallback(async () => {
    const [c, q] = await Promise.all([
      apiGet<{ categories: Category[] }>("/api/admin/categories"),
      apiGet<{ questions: Question[] }>(`/api/admin/questions?take=500${filter ? `&categoryId=${filter}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`),
    ]);
    setCategories(c.categories);
    setQuestions(q.questions);
  }, [filter, search]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function addCategory() {
    const name = prompt("Category name?");
    if (!name) return;
    await guard(() => apiSend("/api/admin/categories", "POST", { name }), "Category added");
  }

  async function guard(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (msg) setNotice(msg);
      await load();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    await guard(async () => {
      await apiSend("/api/admin/questions", "POST", {
        text: form.text,
        categoryId: form.categoryId,
        type: form.type,
        answerKey: form.answerKey || undefined,
        defaultPoints: Number(form.defaultPoints) || 10,
        explanation: form.explanation || undefined,
        options:
          form.type === "MULTIPLE_CHOICE"
            ? options.filter((o) => o.text.trim()).map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
            : undefined,
      });
      setForm({ ...form, text: "", answerKey: "", explanation: "" });
      setOptions([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
      ]);
    }, "Question added");
  }

  function parseImport(): ImportRow[] | null {
    try {
      const parsed = JSON.parse(raw) as ImportRow[];
      if (!Array.isArray(parsed)) throw new Error("not an array");
      return parsed;
    } catch {
      setError("Import must be a JSON array of question objects.");
      return null;
    }
  }

  async function runImport(dryRun: boolean) {
    const rows = parseImport();
    if (!rows) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const d = await apiSend<{ total: number; valid: number; errors: string[]; imported: number }>(
        "/api/admin/questions/import",
        "POST",
        { dryRun, questions: rows }
      );
      if (dryRun) {
        setPreview(d);
      } else if (d.errors.length === 0) {
        setNotice(`${d.imported} questions imported.`);
        setRaw("");
        setPreview(null);
        await load();
      } else {
        setPreview(d);
      }
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Question Bank</h1>
          <p className="text-muted">{questions.length} shown · {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <button className={`btn ${tab === "add" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("add")}>Add one</button>
          <button className={`btn ${tab === "import" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("import")}>Bulk import</button>
        </div>
      </div>

      {error && <div className="mb-4 whitespace-pre-wrap rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      {notice && <div className="mb-4 rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{notice}</div>}

      {/* filters */}
      <div className="mb-4 flex gap-3">
        <select className="input !w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c._count.questions})</option>
          ))}
        </select>
        <input className="input flex-1" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-ghost" onClick={() => void addCategory()}>+ Category</button>
      </div>

      {/* add / import panels */}
      {tab === "add" ? (
        <form onSubmit={addQuestion} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="qtext">Question text</label>
            <textarea id="qtext" className="input min-h-20" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="qcat">Category</label>
            <select id="qcat" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">Pick…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qtype">Type</label>
            <select id="qtype" className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t.replace("_", "-").toLowerCase()}</option>
              ))}
            </select>
          </div>
          {form.type === "MULTIPLE_CHOICE" ? (
            <div className="sm:col-span-2">
              <div className="label">Options (check the correct one)</div>
              <div className="flex flex-col gap-2">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={o.isCorrect}
                      onChange={() => setOptions(options.map((x, j) => ({ ...x, isCorrect: j === i })))}
                    />
                    <input
                      className="input"
                      placeholder={`Option ${i + 1}`}
                      value={o.text}
                      onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                    <button type="button" className="text-xs text-muted hover:text-bad" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                      remove
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost !self-start !text-xs" onClick={() => setOptions([...options, { text: "", isCorrect: false }])}>
                  + option
                </button>
              </div>
            </div>
          ) : form.type !== "SUBJECTIVE" ? (
            <div>
              <label className="label" htmlFor="qkey">Answer key</label>
              <input id="qkey" className="input" value={form.answerKey} onChange={(e) => setForm({ ...form, answerKey: e.target.value })} required />
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="qpts">Default points</label>
            <input id="qpts" className="input" type="number" min={0} value={form.defaultPoints} onChange={(e) => setForm({ ...form, defaultPoints: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="qexp">Explanation (shown after reveal)</label>
            <input id="qexp" className="input" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy || !form.categoryId || !form.text.trim()}>
              {busy ? "Saving…" : "Add question"}
            </button>
          </div>
        </form>
      ) : (
        <div className="panel mb-6 p-4">
          <div className="label">Paste a JSON array of questions</div>
          <textarea
            className="input min-h-40 font-mono text-xs"
            placeholder={`[\n  {\n    "text": "What is 2+2?",\n    "category": "Mathematics",\n    "type": "SHORT_TEXT",\n    "answerKey": "4",\n    "defaultPoints": 10\n  }\n]`}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setPreview(null);
            }}
          />
          <div className="mt-3 flex gap-2">
            <button className="btn btn-ghost" onClick={() => runImport(true)} disabled={busy || !raw.trim()}>
              Validate (dry run)
            </button>
            <button className="btn btn-primary" onClick={() => runImport(false)} disabled={busy || !raw.trim()}>
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
          {preview && (
            <div className="mt-3 rounded-md border border-line bg-panel-2 p-3 text-sm">
              <div className="font-bold">
                {preview.valid} / {preview.total} valid
              </div>
              {preview.errors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-bad">
                  {preview.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {preview.errors.length > 20 && <li>…and {preview.errors.length - 20} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* list */}
      <div className="panel divide-y divide-line">
        {questions.length === 0 && <div className="px-4 py-8 text-center text-muted">No questions yet.</div>}
        {questions.map((q) => (
          <div key={q.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                <span className="mr-2 text-xs font-bold text-muted">{q.category.name}</span>
                {q.text}
              </div>
              <div className="text-xs text-muted">
                {q.type.replace("_", "-").toLowerCase()} · {q.defaultPoints} pts
                {q.options.length > 0 && ` · ${q.options.length} options`}
                {!q.active && " · INACTIVE"}
              </div>
            </div>
            <button
              className="btn btn-ghost !text-xs"
              disabled={busy}
              onClick={() =>
                void guard(() => apiSend(`/api/admin/questions/${q.id}`, "PATCH", { active: !q.active }), q.active ? "Question deactivated" : "Question activated")
              }
            >
              {q.active ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
