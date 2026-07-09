export type JobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "remotive"
  | "arbeitnow";

export interface JobPosting {
  /** Stable id: `${source}:${externalId}` */
  id: string;
  source: JobSource;
  externalId: string;
  title: string;
  company: string;
  location: string;
  url: string;
  /** Plain-text job description (HTML stripped) */
  description: string;
  postedAt?: string;
  remote?: boolean;
}

export interface AtsFormQuestion {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "multiselect" | "boolean" | "file";
  options?: string[];
  required?: boolean;
  source: string;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Case-insensitive check that a job title matches any of the desired titles. */
export function titleMatches(jobTitle: string, wanted: string[]): boolean {
  if (wanted.length === 0) return true;
  const t = jobTitle.toLowerCase();
  return wanted.some((w) => {
    const words = w.toLowerCase().split(/\s+/).filter(Boolean);
    // every significant word of the wanted title appears in the job title,
    // so "Product Manager" matches "Senior Product Manager, Growth"
    return words.every((word) => t.includes(word));
  });
}
