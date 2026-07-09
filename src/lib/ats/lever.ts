import { JobPosting, fetchJson, stripHtml, titleMatches } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
  description?: string;
}

export async function searchLever(board: string, titles: string[]): Promise<JobPosting[]> {
  const data = await fetchJson<LeverPosting[]>(
    `https://api.lever.co/v0/postings/${board}?mode=json`
  );
  if (!Array.isArray(data)) return [];
  return data
    .filter((j) => titleMatches(j.text, titles))
    .map((j) => ({
      id: `lever:${board}/${j.id}`,
      source: "lever" as const,
      externalId: `${board}/${j.id}`,
      title: j.text,
      company: board,
      location: j.categories?.location ?? "",
      url: j.hostedUrl,
      description: j.descriptionPlain ?? stripHtml(j.description ?? ""),
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    }));
}
