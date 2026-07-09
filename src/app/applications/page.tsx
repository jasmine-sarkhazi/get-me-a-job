"use client";

import { useEffect, useState } from "react";

interface AppEvent {
  type: string;
  detail: unknown;
  occurredAt: string;
}

interface Application {
  id: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  location?: string;
  source: string;
  matchScore: number;
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

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

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
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Applied</th>
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <>
                  <tr
                    key={a.id}
                    className="cursor-pointer border-b border-ink-800 hover:bg-ink-900"
                    onClick={() => setOpen(open === a.id ? null : a.id)}
                  >
                    <td className="px-3 py-3 font-medium text-white">
                      <a
                        href={a.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-accent-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.jobTitle}
                      </a>
                    </td>
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
                  {open === a.id && (
                    <tr key={`${a.id}-events`} className="border-b border-ink-800 bg-ink-900/60">
                      <td colSpan={6} className="px-6 py-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Timeline
                        </p>
                        {a.events.length === 0 ? (
                          <p className="text-xs text-slate-500">No events yet.</p>
                        ) : (
                          <ul className="space-y-1 text-xs text-slate-400">
                            {a.events.map((e, i) => (
                              <li key={i}>
                                <span className="text-slate-500">
                                  {new Date(e.occurredAt).toLocaleString()} —{" "}
                                </span>
                                <span className="text-slate-300">{e.type}:</span>{" "}
                                {typeof e.detail === "string"
                                  ? e.detail
                                  : (e.detail as { subject?: string })?.subject ?? JSON.stringify(e.detail).slice(0, 160)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
