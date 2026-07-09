"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Job {
  id: string;
  source: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedAt?: string;
  alreadyApplied?: boolean;
}

interface Match {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  breakdown: Record<string, number>;
}

interface ApplyResult {
  id: string;
  skipped: boolean;
  reason?: string;
  score: number;
  status?: string;
  detail?: string;
}

function scoreColor(score: number) {
  if (score >= 95) return "bg-green-500/20 text-green-300 border-green-700";
  if (score >= 80) return "bg-lime-500/15 text-lime-300 border-lime-800";
  if (score >= 60) return "bg-yellow-500/15 text-yellow-300 border-yellow-800";
  return "bg-red-500/15 text-red-300 border-red-900";
}

export default function SearchPage() {
  const [titles, setTitles] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [threshold, setThreshold] = useState(95);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((d) => {
        setTitles(d.titles ?? []);
        setThreshold(d.autoApplyThreshold ?? 95);
        if ((d.titles ?? []).length > 0) search();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    setLoading(true);
    setError(null);
    setApplyResults(null);
    const res = await fetch("/api/jobs/search");
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Search failed");
      return;
    }
    setJobs(data.jobs ?? []);
    setSelected(new Set());
    setMatches({});
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedJobs = useMemo(() => jobs.filter((j) => selected.has(j.id)), [jobs, selected]);

  async function checkMatch() {
    if (selectedJobs.length === 0) return;
    setMatching(true);
    setError(null);
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobs: selectedJobs.map((j) => ({ id: j.id, title: j.title, description: j.description })),
      }),
    });
    const data = await res.json();
    setMatching(false);
    if (!res.ok) {
      setError(data.error ?? "Matching failed");
      return;
    }
    const next: Record<string, Match> = { ...matches };
    for (const r of data.results) next[r.id] = r.match;
    setMatches(next);
  }

  const eligibleForApply = useMemo(
    () =>
      selectedJobs.filter(
        (j) => !j.alreadyApplied && (matches[j.id]?.score ?? 0) >= threshold
      ),
    [selectedJobs, matches, threshold]
  );

  async function autoApplyNow() {
    if (eligibleForApply.length === 0) return;
    setApplying(true);
    setError(null);
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobs: eligibleForApply.map((j) => ({
          id: j.id,
          source: j.source,
          externalId: j.externalId,
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          description: j.description,
        })),
      }),
    });
    const data = await res.json();
    setApplying(false);
    if (!res.ok) {
      setError(data.error ?? "Auto-apply failed");
      return;
    }
    setApplyResults(data.results);
    search();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Job search</h1>
          <p className="mt-1 text-sm text-slate-400">
            {titles.length > 0 ? (
              <>Sweeping live boards for: <span className="text-slate-200">{titles.join(", ")}</span></>
            ) : (
              <>
                No target roles yet —{" "}
                <Link href="/onboarding" className="text-accent-400 underline">
                  set them up
                </Link>
              </>
            )}
          </p>
        </div>
        <button onClick={search} disabled={loading || titles.length === 0} className="btn-primary">
          {loading ? "Sweeping boards…" : "Refresh jobs"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</p>}

      {applyResults && (
        <div className="card mt-4">
          <h3 className="font-semibold text-white">Auto-apply run</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {applyResults.map((r) => (
              <li key={r.id} className="text-slate-300">
                <span className={`mr-2 inline-block rounded border px-1.5 text-xs ${scoreColor(r.score)}`}>
                  {r.score}%
                </span>
                {r.skipped ? `Skipped — ${r.reason}` : `${r.status}: ${r.detail}`}
              </li>
            ))}
          </ul>
          <Link href="/applications" className="mt-3 inline-block text-sm text-accent-400 underline">
            View in tracker →
          </Link>
        </div>
      )}

      {/* Sticky action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent-600 bg-ink-900/95 px-4 py-3 shadow-lg">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button onClick={checkMatch} disabled={matching} className="btn-primary">
            {matching ? "Scoring…" : "Check match"}
          </button>
          <button
            onClick={autoApplyNow}
            disabled={applying || eligibleForApply.length === 0}
            className="btn-secondary"
            title={`Applies to selected jobs scoring ≥ ${threshold}%`}
          >
            {applying
              ? "Applying…"
              : `Auto-apply ${eligibleForApply.length} job${eligibleForApply.length === 1 ? "" : "s"} ≥ ${threshold}%`}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-slate-400 hover:text-white">
            Clear
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading && <p className="text-slate-400">Sweeping Greenhouse, Lever, Ashby, Remotive and Arbeitnow…</p>}
        {!loading && jobs.length === 0 && titles.length > 0 && (
          <p className="text-slate-400">No jobs loaded yet — hit “Refresh jobs”.</p>
        )}
        {jobs.map((job) => {
          const match = matches[job.id];
          return (
            <div
              key={job.id}
              className={`card cursor-pointer transition-colors ${
                selected.has(job.id) ? "!border-accent-500" : "hover:border-ink-700"
              } ${job.alreadyApplied ? "opacity-60" : ""}`}
              onClick={() => !job.alreadyApplied && toggle(job.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    checked={selected.has(job.id)}
                    disabled={job.alreadyApplied}
                    onChange={() => toggle(job.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div>
                    <h3 className="font-semibold text-white">{job.title}</h3>
                    <p className="text-sm text-slate-400">
                      <span className="capitalize">{job.company}</span>
                      {job.location && <> · {job.location}</>}
                      {" · "}
                      <span className="uppercase text-xs tracking-wide text-slate-500">{job.source}</span>
                      {job.alreadyApplied && <span className="ml-2 text-green-400">applied ✓</span>}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {match && (
                    <span className={`rounded-lg border px-2 py-1 text-sm font-bold ${scoreColor(match.score)}`}>
                      {match.score}%
                    </span>
                  )}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm text-accent-400 hover:underline"
                  >
                    View ↗
                  </a>
                </div>
              </div>
              {match && (
                <div className="mt-3 border-t border-ink-700 pt-3 text-xs text-slate-400">
                  <p>
                    <span className="text-green-400">Matched:</span>{" "}
                    {match.matchedSkills.slice(0, 12).join(", ") || "—"}
                  </p>
                  {match.missingSkills.length > 0 && (
                    <p className="mt-1">
                      <span className="text-red-400">Missing:</span>{" "}
                      {match.missingSkills.slice(0, 10).join(", ")}
                    </p>
                  )}
                </div>
              )}
              <button
                className="mt-2 text-xs text-slate-500 hover:text-slate-300"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(expanded === job.id ? null : job.id);
                }}
              >
                {expanded === job.id ? "Hide description" : "Show description"}
              </button>
              {expanded === job.id && (
                <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line text-xs text-slate-400">
                  {job.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
