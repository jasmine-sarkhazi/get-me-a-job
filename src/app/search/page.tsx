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
  remote?: boolean;
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

interface Filters {
  q: string;
  source: string;
  location: string;
  remoteOnly: boolean;
  postedWithinDays: number; // 0 = any time
  hideApplied: boolean;
  sort: "newest" | "match";
}

const DEFAULT_FILTERS: Filters = {
  q: "",
  source: "all",
  location: "",
  remoteOnly: false,
  postedWithinDays: 0,
  hideApplied: false,
  sort: "newest",
};

function scoreColor(score: number) {
  if (score >= 95) return "bg-green-500/20 text-green-300 border-green-700";
  if (score >= 80) return "bg-lime-500/15 text-lime-300 border-lime-800";
  if (score >= 60) return "bg-yellow-500/15 text-yellow-300 border-yellow-800";
  return "bg-red-500/15 text-red-300 border-red-900";
}

function postedAgo(postedAt?: string): string | null {
  if (!postedAt) return null;
  const t = new Date(postedAt).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function isRemote(job: Job): boolean {
  return job.remote === true || /remote/i.test(job.location);
}

export default function SearchPage() {
  const [titles, setTitles] = useState<string[]>([]);
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [threshold, setThreshold] = useState(95);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((d) => {
        setTitles(d.titles ?? []);
        setSavedLocations(d.locations ?? []);
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

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const sources = useMemo(
    () => [...new Set(jobs.map((j) => j.source))].sort(),
    [jobs]
  );

  // All filter text comparisons are case-insensitive.
  const filteredJobs = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const loc = filters.location.trim().toLowerCase();
    let list = jobs.filter((j) => {
      if (q && !`${j.title} ${j.company}`.toLowerCase().includes(q)) return false;
      if (filters.source !== "all" && j.source !== filters.source) return false;
      if (loc && !(j.location.toLowerCase().includes(loc) || (loc === "remote" && isRemote(j)))) return false;
      if (filters.remoteOnly && !isRemote(j)) return false;
      if (filters.hideApplied && j.alreadyApplied) return false;
      if (filters.postedWithinDays > 0) {
        const t = j.postedAt ? new Date(j.postedAt).getTime() : NaN;
        if (Number.isNaN(t) || Date.now() - t > filters.postedWithinDays * 86_400_000)
          return false;
      }
      return true;
    });
    if (filters.sort === "match") {
      list = [...list].sort(
        (a, b) => (matches[b.id]?.score ?? -1) - (matches[a.id]?.score ?? -1)
      );
    }
    return list;
  }, [jobs, filters, matches]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedJobs = useMemo(() => jobs.filter((j) => selected.has(j.id)), [jobs, selected]);

  async function checkMatch(target?: Job[]) {
    const list = target ?? selectedJobs;
    if (list.length === 0) return;
    setMatching(true);
    setError(null);
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobs: list.map((j) => ({ id: j.id, title: j.title, description: j.description })),
      }),
    });
    const data = await res.json();
    setMatching(false);
    if (!res.ok) {
      setError(data.error ?? "Matching failed");
      return;
    }
    setMatches((prev) => {
      const next = { ...prev };
      for (const r of data.results) next[r.id] = r.match;
      return next;
    });
  }

  const eligibleForApply = useMemo(
    () =>
      selectedJobs.filter(
        (j) => !j.alreadyApplied && (matches[j.id]?.score ?? 0) >= threshold
      ),
    [selectedJobs, matches, threshold]
  );

  async function applyJobs(list: Job[], force: boolean) {
    if (list.length === 0) return;
    setApplyingIds((s) => new Set([...s, ...list.map((j) => j.id)]));
    setError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          force,
          jobs: list.map((j) => ({
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
      if (!res.ok) {
        setError(data.error ?? "Apply failed");
        return;
      }
      setApplyResults(data.results);
      // mark applied jobs in place instead of re-sweeping every board
      const appliedIds = new Set(
        (data.results as ApplyResult[]).filter((r) => !r.skipped).map((r) => r.id)
      );
      setJobs((js) =>
        js.map((j) => (appliedIds.has(j.id) ? { ...j, alreadyApplied: true } : j))
      );
      setSelected((s) => {
        const next = new Set(s);
        for (const id of appliedIds) next.delete(id);
        return next;
      });
    } finally {
      setApplyingIds((s) => {
        const next = new Set(s);
        for (const j of list) next.delete(j.id);
        return next;
      });
    }
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

      {/* Filter bar */}
      {jobs.length > 0 && (
        <div className="card mt-4 !p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input
              className="input lg:col-span-2"
              placeholder="Filter by title or company…"
              value={filters.q}
              onChange={(e) => setFilter("q", e.target.value)}
            />
            <select
              className="input"
              value={filters.source}
              onChange={(e) => setFilter("source", e.target.value)}
            >
              <option value="all">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Location…"
              value={filters.location}
              onChange={(e) => setFilter("location", e.target.value)}
            />
            <select
              className="input"
              value={filters.postedWithinDays}
              onChange={(e) => setFilter("postedWithinDays", Number(e.target.value))}
            >
              <option value={0}>Any time</option>
              <option value={1}>Past 24 hours</option>
              <option value={7}>Past week</option>
              <option value={30}>Past month</option>
            </select>
            <select
              className="input"
              value={filters.sort}
              onChange={(e) => setFilter("sort", e.target.value as Filters["sort"])}
            >
              <option value="newest">Newest first</option>
              <option value="match">Best match first</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={filters.remoteOnly}
                onChange={(e) => setFilter("remoteOnly", e.target.checked)}
              />
              Remote only
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={filters.hideApplied}
                onChange={(e) => setFilter("hideApplied", e.target.checked)}
              />
              Hide applied
            </label>
            {savedLocations.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">Saved:</span>
                {savedLocations.map((l) => (
                  <button
                    key={l}
                    onClick={() =>
                      setFilter("location", filters.location.toLowerCase() === l.toLowerCase() ? "" : l)
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      filters.location.toLowerCase() === l.toLowerCase()
                        ? "border-accent-500 bg-ink-700 text-white"
                        : "border-ink-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </span>
            )}
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="ml-auto text-xs text-slate-500 hover:text-white"
            >
              Reset filters
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Showing {filteredJobs.length} of {jobs.length} jobs
          </p>
        </div>
      )}

      {error && <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</p>}

      {applyResults && (
        <div className="card mt-4">
          <h3 className="font-semibold text-white">Apply run</h3>
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

      {/* Sticky multi-select action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent-600 bg-ink-900/95 px-4 py-3 shadow-lg">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button onClick={() => checkMatch()} disabled={matching} className="btn-primary">
            {matching ? "Scoring…" : "Check match"}
          </button>
          <button
            onClick={() => applyJobs(eligibleForApply, false)}
            disabled={applyingIds.size > 0 || eligibleForApply.length === 0}
            className="btn-secondary"
            title={`Applies to selected jobs scoring ≥ ${threshold}%`}
          >
            {applyingIds.size > 0
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
        {!loading && jobs.length > 0 && filteredJobs.length === 0 && (
          <p className="text-slate-400">No jobs match the current filters.</p>
        )}
        {filteredJobs.map((job) => {
          const match = matches[job.id];
          const ago = postedAgo(job.postedAt);
          const applying = applyingIds.has(job.id);
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
                      {isRemote(job) && !/remote/i.test(job.location) && <> · Remote</>}
                      {" · "}
                      <span className="text-xs uppercase tracking-wide text-slate-500">{job.source}</span>
                      {job.alreadyApplied && <span className="ml-2 text-green-400">applied ✓</span>}
                    </p>
                    {ago && (
                      <p className="mt-0.5 text-xs text-slate-500" title={new Date(job.postedAt!).toLocaleString()}>
                        Posted {ago}
                        {" · "}
                        {new Date(job.postedAt!).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {match && (
                    <span className={`rounded-lg border px-2 py-1 text-sm font-bold ${scoreColor(match.score)}`}>
                      {match.score}%
                    </span>
                  )}
                  {!job.alreadyApplied && (
                    <button
                      className="btn-primary !px-3 !py-1.5 text-xs"
                      disabled={applying}
                      onClick={(e) => {
                        e.stopPropagation();
                        applyJobs([job], true);
                      }}
                      title="Apply to this job now with your stored answers and resume"
                    >
                      {applying ? "Applying…" : "Apply"}
                    </button>
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
