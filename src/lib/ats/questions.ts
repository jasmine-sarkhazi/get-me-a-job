import { prisma } from "@/lib/prisma";
import { ASHBY_BOARDS, GREENHOUSE_BOARDS } from "./boards";
import { harvestGreenhouseQuestions, normalizeQuestionKey } from "./greenhouse";
import { AtsFormQuestion, fetchJson } from "./types";

/**
 * Canonical application questions asked across Greenhouse, Lever, Ashby and
 * Jobvite hosted forms. Live harvesting (below) augments this set with the
 * long tail of company-specific questions.
 */
export const CANONICAL_QUESTIONS: AtsFormQuestion[] = [
  { key: "first_name", label: "First Name", type: "text", required: true, source: "canonical" },
  { key: "last_name", label: "Last Name", type: "text", required: true, source: "canonical" },
  { key: "email", label: "Email", type: "text", required: true, source: "canonical" },
  { key: "phone", label: "Phone", type: "text", required: true, source: "canonical" },
  { key: "location", label: "Location (City)", type: "text", required: true, source: "canonical" },
  { key: "linkedin_profile", label: "LinkedIn Profile", type: "text", source: "canonical" },
  { key: "github_profile", label: "GitHub Profile", type: "text", source: "canonical" },
  { key: "website", label: "Portfolio / Website", type: "text", source: "canonical" },
  {
    key: "work_authorization",
    label: "Are you legally authorized to work in the country of this job?",
    type: "select",
    options: ["Yes", "No"],
    required: true,
    source: "canonical",
  },
  {
    key: "require_sponsorship",
    label: "Will you now or in the future require visa sponsorship?",
    type: "select",
    options: ["Yes", "No"],
    required: true,
    source: "canonical",
  },
  { key: "desired_salary", label: "Desired Salary / Compensation Expectations", type: "text", source: "canonical" },
  { key: "notice_period", label: "Notice Period / Earliest Start Date", type: "text", source: "canonical" },
  {
    key: "willing_to_relocate",
    label: "Are you willing to relocate?",
    type: "select",
    options: ["Yes", "No"],
    source: "canonical",
  },
  {
    key: "remote_preference",
    label: "Work location preference",
    type: "select",
    options: ["Remote", "Hybrid", "On-site", "No preference"],
    source: "canonical",
  },
  { key: "how_did_you_hear_about_this_job", label: "How did you hear about this job?", type: "text", source: "canonical" },
  { key: "cover_letter", label: "Cover Letter / Why do you want to work here?", type: "textarea", source: "canonical" },
  {
    key: "gender",
    label: "Gender (Voluntary EEOC Self-Identification)",
    type: "select",
    options: ["Male", "Female", "Non-binary", "Decline To Self Identify"],
    source: "canonical",
  },
  {
    key: "hispanic_ethnicity",
    label: "Are you Hispanic/Latino? (Voluntary EEOC)",
    type: "select",
    options: ["Yes", "No", "Decline To Self Identify"],
    source: "canonical",
  },
  {
    key: "race",
    label: "Race (Voluntary EEOC Self-Identification)",
    type: "select",
    options: [
      "American Indian or Alaskan Native",
      "Asian",
      "Black or African American",
      "Hispanic or Latino",
      "Native Hawaiian or Other Pacific Islander",
      "Two or More Races",
      "White",
      "Decline To Self Identify",
    ],
    source: "canonical",
  },
  {
    key: "veteran_status",
    label: "Veteran Status (Voluntary EEOC)",
    type: "select",
    options: ["I am not a protected veteran", "I identify as one or more of the classifications of a protected veteran", "I don't wish to answer"],
    source: "canonical",
  },
  {
    key: "disability_status",
    label: "Disability Status (Voluntary, Form CC-305)",
    type: "select",
    options: ["Yes, I have a disability (or previously had one)", "No, I do not have a disability", "I do not want to answer"],
    source: "canonical",
  },
];

interface AshbyFormResponse {
  jobs?: { id: string }[];
}

/** Ashby publishes application form fields on each posting via its posting API. */
async function harvestAshbyQuestions(board: string): Promise<AtsFormQuestion[]> {
  const data = await fetchJson<{
    jobs?: { applicationFormFields?: { title: string; isRequired?: boolean; type?: string; selectableValues?: { label: string }[] }[] }[];
  }>(`https://api.ashbyhq.com/posting-api/job-board/${board}?includeApplicationForm=true`);
  const questions: AtsFormQuestion[] = [];
  for (const job of (data?.jobs ?? []).slice(0, 5)) {
    for (const f of job.applicationFormFields ?? []) {
      if (!f.title) continue;
      questions.push({
        key: normalizeQuestionKey(f.title),
        label: f.title,
        type: f.selectableValues?.length ? "select" : f.type === "LongText" ? "textarea" : "text",
        options: f.selectableValues?.map((v) => v.label),
        required: f.isRequired,
        source: "ashby",
      });
    }
  }
  return questions;
}

/**
 * Sweep live Greenhouse and Ashby boards for their real application-form
 * questions, merge with the canonical set, and persist to AtsQuestion.
 * Returns the total question count.
 */
export async function harvestAndStoreQuestions(): Promise<number> {
  const harvests = await Promise.allSettled([
    ...GREENHOUSE_BOARDS.slice(0, 8).map((b) => harvestGreenhouseQuestions(b, 3)),
    ...ASHBY_BOARDS.slice(0, 5).map((b) => harvestAshbyQuestions(b)),
  ]);
  const harvested = harvests.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Merge: canonical first, then harvested ranked by frequency
  const merged = new Map<string, AtsFormQuestion & { frequency: number }>();
  for (const q of CANONICAL_QUESTIONS) merged.set(q.key, { ...q, frequency: 1 });
  for (const q of harvested) {
    if (!q.key || q.type === "file") continue; // resume/cover-letter uploads handled separately
    const existing = merged.get(q.key);
    if (existing) {
      existing.frequency += 1;
      if (!existing.options?.length && q.options?.length) existing.options = q.options;
    } else {
      merged.set(q.key, { ...q, frequency: 1 });
    }
  }

  // Keep harvested questions seen on at least 2 postings (drop one-off essays),
  // canonical questions always stay.
  const rows = [...merged.values()].filter(
    (q) => q.source === "canonical" || q.frequency >= 2
  );

  for (const q of rows) {
    await prisma.atsQuestion.upsert({
      where: { key: q.key },
      create: {
        key: q.key,
        label: q.label,
        type: q.type,
        options: JSON.stringify(q.options ?? []),
        required: q.required ?? false,
        sources: JSON.stringify([q.source]),
        frequency: q.frequency,
      },
      update: { frequency: q.frequency },
    });
  }
  return rows.length;
}

/** Load the question set for the onboarding form, seeding canonical set if empty. */
export async function getQuestionSet() {
  let questions = await prisma.atsQuestion.findMany({
    orderBy: [{ required: "desc" }, { frequency: "desc" }],
  });
  if (questions.length === 0) {
    for (const q of CANONICAL_QUESTIONS) {
      await prisma.atsQuestion.upsert({
        where: { key: q.key },
        create: {
          key: q.key,
          label: q.label,
          type: q.type,
          options: JSON.stringify(q.options ?? []),
          required: q.required ?? false,
          sources: JSON.stringify(["canonical"]),
          frequency: 1,
        },
        update: {},
      });
    }
    questions = await prisma.atsQuestion.findMany({
      orderBy: [{ required: "desc" }, { frequency: "desc" }],
    });
  }
  return questions.map((q) => ({
    key: q.key,
    label: q.label,
    type: q.type,
    options: JSON.parse(q.options) as string[],
    required: q.required,
  }));
}
