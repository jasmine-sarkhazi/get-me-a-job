"use client";

import { useEffect, useState } from "react";

export interface Question {
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
}

export function QuestionForm({
  onSaved,
  submitLabel = "Save answers",
}: {
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [harvesting, setHarvesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/questions").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()),
    ]).then(([q, p]) => {
      setQuestions(q.questions ?? []);
      setAnswers(p.answers ?? {});
      setLoading(false);
    });
  }, []);

  async function harvest() {
    setHarvesting(true);
    setMessage("Scanning live Greenhouse & Ashby application forms for questions…");
    try {
      const res = await fetch("/api/questions", { method: "POST" });
      const data = await res.json();
      setQuestions(data.questions ?? []);
      setMessage(`Question set refreshed from live job boards (${data.harvested} questions).`);
    } catch {
      setMessage("Harvest failed — using the standard question set.");
    }
    setHarvesting(false);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage("Answers saved. Auto-apply will use these on every application.");
      onSaved?.();
    } else {
      setMessage("Save failed — try again.");
    }
  }

  if (loading) return <p className="text-slate-400">Loading questions…</p>;

  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {questions.length} questions collected from Greenhouse, Ashby, Lever &amp; Jobvite forms.
        </p>
        <button onClick={harvest} disabled={harvesting} className="btn-secondary">
          {harvesting ? "Scanning boards…" : "Re-scan live boards"}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {questions.map((q) => (
          <div key={q.key} className={q.type === "textarea" ? "sm:col-span-2" : ""}>
            <label className="label">
              {q.label}
              {q.required && <span className="text-red-400"> *</span>}
            </label>
            {q.type === "textarea" ? (
              <textarea
                className="input min-h-24"
                value={answers[q.key] ?? ""}
                onChange={(e) => set(q.key, e.target.value)}
              />
            ) : q.type === "select" && q.options.length > 0 ? (
              <select
                className="input"
                value={answers[q.key] ?? ""}
                onChange={(e) => set(q.key, e.target.value)}
              >
                <option value="">— select —</option>
                {q.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={answers[q.key] ?? ""}
                onChange={(e) => set(q.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : submitLabel}
        </button>
        {message && <p className="text-sm text-slate-400">{message}</p>}
      </div>
    </div>
  );
}
