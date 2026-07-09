import { AtsFormQuestion, JobPosting, fetchJson, stripHtml, titleMatches } from "./types";

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
  questions?: GhQuestion[];
}

interface GhQuestion {
  label: string;
  required: boolean;
  fields: { name: string; type: string; values?: { label: string; value: unknown }[] }[];
}

interface GhBoardResponse {
  jobs: GhJob[];
}

const API = "https://boards-api.greenhouse.io/v1/boards";

export async function searchGreenhouse(board: string, titles: string[]): Promise<JobPosting[]> {
  const data = await fetchJson<GhBoardResponse>(`${API}/${board}/jobs?content=true`);
  if (!data?.jobs) return [];
  return data.jobs
    .filter((j) => titleMatches(j.title, titles))
    .map((j) => ({
      id: `greenhouse:${board}/${j.id}`,
      source: "greenhouse" as const,
      externalId: `${board}/${j.id}`,
      title: j.title,
      company: board,
      location: j.location?.name ?? "",
      url: j.absolute_url,
      description: stripHtml(j.content ?? ""),
      postedAt: j.updated_at,
    }));
}

/** Fetch a single posting including its application-form questions. */
export async function getGreenhouseJob(board: string, jobId: string): Promise<GhJob | null> {
  return fetchJson<GhJob>(`${API}/${board}/jobs/${jobId}?questions=true`);
}

const GH_TYPE_MAP: Record<string, AtsFormQuestion["type"]> = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
};

/** Harvest the application questions from live postings on a Greenhouse board. */
export async function harvestGreenhouseQuestions(
  board: string,
  maxJobs = 5
): Promise<AtsFormQuestion[]> {
  const listing = await fetchJson<GhBoardResponse>(`${API}/${board}/jobs`);
  if (!listing?.jobs) return [];
  const questions: AtsFormQuestion[] = [];
  for (const job of listing.jobs.slice(0, maxJobs)) {
    const detail = await getGreenhouseJob(board, String(job.id));
    for (const q of detail?.questions ?? []) {
      const field = q.fields?.[0];
      if (!field) continue;
      questions.push({
        key: normalizeQuestionKey(q.label),
        label: q.label,
        type: GH_TYPE_MAP[field.type] ?? "text",
        options: field.values?.map((v) => v.label),
        required: q.required,
        source: "greenhouse",
      });
    }
  }
  return questions;
}

export function normalizeQuestionKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}
