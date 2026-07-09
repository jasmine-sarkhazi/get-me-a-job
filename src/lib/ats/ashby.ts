import { JobPosting, fetchJson, stripHtml, titleMatches } from "./types";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  jobUrl: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  isRemote?: boolean;
}

interface AshbyBoardResponse {
  jobs: AshbyJob[];
}

export async function searchAshby(board: string, titles: string[]): Promise<JobPosting[]> {
  const data = await fetchJson<AshbyBoardResponse>(
    `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`
  );
  if (!data?.jobs) return [];
  return data.jobs
    .filter((j) => titleMatches(j.title, titles))
    .map((j) => ({
      id: `ashby:${board}/${j.id}`,
      source: "ashby" as const,
      externalId: `${board}/${j.id}`,
      title: j.title,
      company: board,
      location: j.location ?? "",
      url: j.jobUrl,
      description: j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? ""),
      postedAt: j.publishedAt,
      remote: j.isRemote,
    }));
}
