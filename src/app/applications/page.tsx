"use client";

import { Fragment, useEffect, useState } from "react";

interface AppEvent {
  type: string;
  detail: unknown;
  occurredAt: string;
}

interface MatchDetail {
  matchedSkills?: string[];
  missingSkills?: string[];
  breakdown?: Record<string, number>;
}

interface Application {
  id: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  location?: string;
  source: string;
  matchScore: number;
  matchDetail?: MatchDetail;
  answersUsed?: Record<string, string>;
  status: string;
  method: string;
  appliedAt: string;
  events: AppEvent[];
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-blue-500/15 text-blue-300 border-blue-800",
  queued: "bg-slate-500/15 text-slate-300 border-slate-700",
  needs_review: "bg-yellow-500/15 text-yellow-300 border-yellow-800",
  failed: "bg-red-500/15 text-red-300 border-red-900",
  rejected: "bg-red-500/15 text-red-300 border-red-900",
  interview: "bg-green-500/15 text-green-300 border-green-800",
  assessment: "bg-purple-500/15 text-purple-300 border-purple-800",
  offer: "bg-green-500/25 text-green-200 border-green-600",
};

function eventText(e: AppEvent): string {
  if (typeof e.detail === "string") return e.detail;
  const d = e.detail as { subject?: string; from?: string; classified?: string } | null;
  if (d?.subject) return `${d.classified ? `[${d.classified}] ` : ""}${d.subject}${d.from ? ` — ${d.from}` : ""}`;
  return JSON.stringify(e.detail).slice(0, 200);
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showAnswers, setShowAnswers] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/applications");
    const data = await res.json();
    setApps(data.applications ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function syncInbox() {
    setSyncing(true);
    setSyncMessage(null);
    const res = await fetch("/api/email/sync", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setSyncMessage(data.error ?? "Sync failed");
      return;
    }
    setSyncMessage(`Scanned ${data.scanned} emails, ${data.updates} update${data.updates === 1 ? "" : "s"}.`);
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every application, when it went out, at what match rate — and what the company said back.
            Click a row for full details.
          </p>
        </div>
        <button onClick={syncInbox} disabled={syncing} className="btn-primary">
          {syncing ? "Checking Gmail…" : "Sync inbox"}
        </button>
      </div>
      {syncMessage && <p className="mt-3 text-sm text-slate-400">{syncMessage}</p>}

      {loading ? (
        <p className="mt-6 text-slate-400">Loading…</p>
      ) : apps.length === 0 ? (
        <div className="card mt-6 text-center text-slate-400">
          Nothing tracked yet. Select jobs on the search page, check match, and apply.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs uppercase tracking-wide text-slate-500">
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Applied</th>
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => {
                const isOpen = open === a.id;
                const answers = a.answersUsed ?? {};
                const answerEntries = Object.entries(answers).filter(([, v]) => v);
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={`cursor-pointer border-b border-ink-800 hover:bg-ink-900 ${isOpen ? "bg-ink-900" : ""}`}
                      onClick={() => setOpen(isOpen ? null : a.id)}
                    >
                      <td className="px-3 py-3 text-slate-500">{isOpen ? "▾" : "▸"}</td>
                      <td className="px-3 py-3 font-medium text-white">{a.jobTitle}</td>
                      <td className="px-3 py-3 capitalize">{a.company}</td>
                      <td className="px-3 py-3 text-slate-400">
                        {new Date(a.appliedAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-bold text-white">{a.matchScore}%</span>
                      </td>
                      <td className="px-3 py-3 text-slate-400">{a.method}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded border px-2 py-0.5 text-xs ${
                            STATUS_STYLES[a.status] ?? STATUS_STYLES.queued
                          }`}
                        >
                          {a.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-ink-800 bg-ink-900/60">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid gap-5 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Timeline
                              </p>
                              {a.events.length === 0 ? (
                                <p className="text-xs text-slate-500">No events recorded.</p>
                              ) : (
                                <ul className="space-y-1.5 text-xs text-slate-400">
                                  {a.events.map((e, i) => (
                                    <li key={i}>
                                      <span className="text-slate-500">
                                        {new Date(e.occurredAt).toLocaleString()} —{" "}
                                      </span>
                                      <span className="text-slate-300">{e.type.replace("_", " ")}:</span>{" "}
                                      {eventText(e)}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="mt-3 flex gap-4 text-xs">
                                <a
                                  href={a.jobUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-accent-400 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View job posting ↗
                                </a>
                                <span className="text-slate-500">
                                  {a.location ? `${a.location} · ` : ""}
                                  via {a.source}
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Match {a.matchScore}%
                              </p>
                              {a.matchDetail?.matchedSkills?.length ? (
                                <p className="text-xs text-slate-400">
                                  <span className="text-green-400">Matched:</span>{" "}
                                  {a.matchDetail.matchedSkills.slice(0, 12).join(", ")}
                                </p>
                              ) : null}
                              {a.matchDetail?.missingSkills?.length ? (
                                <p className="mt-1 text-xs text-slate-400">
                                  <span className="text-red-400">Missing:</span>{" "}
                                  {a.matchDetail.missingSkills.slice(0, 10).join(", ")}
                                </p>
                              ) : null}
                              <div className="mt-3">
                                <button
                                  className="text-xs text-accent-400 hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAnswers(showAnswers === a.id ? null : a.id);
                                  }}
                                >
                                  {showAnswers === a.id
                                    ? "Hide submitted answers"
                                    : `Show answers used (${answerEntries.length})`}
                                </button>
                                {showAnswers === a.id && (
                                  <dl className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                                    {answerEntries.length === 0 && (
                                      <p className="text-slate-500">No answers were recorded.</p>
                                    )}
                                    {answerEntries.map(([k, v]) => (
                                      <div key={k} className="flex gap-2">
                                        <dt className="shrink-0 text-slate-500">{k.replace(/_/g, " ")}:</dt>
                                        <dd className="truncate text-slate-300" title={v}>
                                          {v}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
