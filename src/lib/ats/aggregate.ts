import { ASHBY_BOARDS, GREENHOUSE_BOARDS, LEVER_BOARDS } from "./boards";
import { searchAshby } from "./ashby";
import { searchGreenhouse } from "./greenhouse";
import { searchLever } from "./lever";
import { JobPosting, fetchJson, stripHtml, titleMatches } from "./types";

interface RemotiveResponse {
  jobs: {
    id: number;
    title: string;
    company_name: string;
    url: string;
    candidate_required_location?: string;
    publication_date?: string;
    description?: string;
  }[];
}

async function searchRemotive(title: string): Promise<JobPosting[]> {
  const data = await fetchJson<RemotiveResponse>(
    `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(title)}&limit=25`
  );
  return (data?.jobs ?? []).map((j) => ({
    id: `remotive:${j.id}`,
    source: "remotive" as const,
    externalId: String(j.id),
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location ?? "Remote",
    url: j.url,
    description: stripHtml(j.description ?? ""),
    postedAt: j.publication_date,
    remote: true,
  }));
}

interface ArbeitnowResponse {
  data: {
    slug: string;
    title: string;
    company_name: string;
    url: string;
    location?: string;
    remote?: boolean;
    description?: string;
    created_at?: number;
  }[];
}

async function searchArbeitnow(titles: string[]): Promise<JobPosting[]> {
  const data = await fetchJson<ArbeitnowResponse>(
    "https://www.arbeitnow.com/api/job-board-api"
  );
  return (data?.data ?? [])
    .filter((j) => titleMatches(j.title, titles))
    .map((j) => ({
      id: `arbeitnow:${j.slug}`,
      source: "arbeitnow" as const,
      externalId: j.slug,
      title: j.title,
      company: j.company_name,
      location: j.location ?? "",
      url: j.url,
      description: stripHtml(j.description ?? ""),
      postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined,
      remote: j.remote,
    }));
}

/**
 * Sweep every configured source concurrently for postings whose titles match
 * the user's desired roles. Failed sources are skipped, never fatal.
 */
export async function aggregateJobs(titles: string[]): Promise<JobPosting[]> {
  const tasks: Promise<JobPosting[]>[] = [
    ...GREENHOUSE_BOARDS.map((b) => searchGreenhouse(b, titles)),
    ...LEVER_BOARDS.map((b) => searchLever(b, titles)),
    ...ASHBY_BOARDS.map((b) => searchAshby(b, titles)),
    ...titles.map((t) => searchRemotive(t)),
    searchArbeitnow(titles),
  ];
  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Remotive returns keyword matches; keep only real title matches for consistency
  const filtered = all.filter((j) => titleMatches(j.title, titles));

  // Dedup by id, newest first
  const byId = new Map<string, JobPosting>();
  for (const job of filtered) if (!byId.has(job.id)) byId.set(job.id, job);
  return [...byId.values()].sort((a, b) =>
    (b.postedAt ?? "").localeCompare(a.postedAt ?? "")
  );
}

/** Look a job back up by its aggregate id (`source:externalId`). */
export async function findJobById(id: string, titles: string[] = []): Promise<JobPosting | null> {
  const jobs = await aggregateJobs(titles);
  return jobs.find((j) => j.id === id) ?? null;
}
