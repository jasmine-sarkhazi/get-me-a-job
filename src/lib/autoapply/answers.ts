import { normalizeQuestionKey } from "@/lib/ats/greenhouse";

export type AnswerMap = Record<string, string>;

// Alternate phrasings ATS forms use for the same canonical field.
const KEY_SYNONYMS: Record<string, string[]> = {
  first_name: ["first_name", "given_name", "name_first", "first"],
  last_name: ["last_name", "family_name", "surname", "name_last", "last"],
  email: ["email", "email_address", "e_mail"],
  phone: ["phone", "phone_number", "mobile", "telephone", "mobile_number"],
  location: ["location", "city", "current_location", "location_city", "where_are_you_located", "where_are_you_based"],
  linkedin_profile: ["linkedin_profile", "linkedin", "linkedin_url", "linkedin_profile_url"],
  github_profile: ["github_profile", "github", "github_url"],
  website: ["website", "portfolio", "personal_website", "portfolio_url", "other_website"],
  work_authorization: [
    "work_authorization",
    "are_you_legally_authorized_to_work",
    "are_you_authorized_to_work",
    "are_you_legally_authorized_to_work_in_the_united_states",
    "do_you_have_the_right_to_work",
  ],
  require_sponsorship: [
    "require_sponsorship",
    "will_you_now_or_in_the_future_require_sponsorship",
    "do_you_require_sponsorship",
    "will_you_require_visa_sponsorship",
    "do_you_now_or_in_the_future_require_visa_sponsorship",
  ],
  desired_salary: ["desired_salary", "salary_expectations", "compensation_expectations", "expected_salary", "what_are_your_salary_expectations"],
  notice_period: ["notice_period", "earliest_start_date", "when_can_you_start", "start_date", "availability"],
  willing_to_relocate: ["willing_to_relocate", "are_you_willing_to_relocate", "open_to_relocation"],
  remote_preference: ["remote_preference", "work_location_preference", "are_you_open_to_remote"],
  how_did_you_hear_about_this_job: ["how_did_you_hear_about_this_job", "how_did_you_hear_about_us", "referral_source", "source"],
  cover_letter: ["cover_letter", "why_do_you_want_to_work_here", "why_are_you_interested", "anything_else"],
  gender: ["gender", "gender_identity"],
  race: ["race", "race_ethnicity", "ethnicity"],
  hispanic_ethnicity: ["hispanic_ethnicity", "are_you_hispanic_latino", "hispanic_or_latino"],
  veteran_status: ["veteran_status", "protected_veteran"],
  disability_status: ["disability_status", "disability"],
  full_name: ["full_name", "name", "your_name"],
  post_employment_restrictions: [
    "post_employment_restrictions",
    "employment_agreements",
    "non_compete",
    "are_you_subject_to_any_employment_agreements",
  ],
  country: [
    "country",
    "please_choose_the_country_in_which_you_are_located",
    "country_of_residence",
    "current_country",
    "in_which_country_do_you_reside",
    "what_country_are_you_located_in",
  ],
  located_in_us: [
    "located_in_us",
    "are_you_currently_located_in_the_united_states_of_america",
    "are_you_currently_located_in_the_united_states",
    "are_you_based_in_the_us",
  ],
};

const REVERSE_SYNONYMS: Record<string, string> = {};
for (const [canonical, alts] of Object.entries(KEY_SYNONYMS)) {
  for (const alt of alts) REVERSE_SYNONYMS[alt] = canonical;
}

/**
 * Find the user's stored answer for an arbitrary form-field label.
 * Tries exact key, synonym table, then substring heuristics.
 */
export function answerForLabel(label: string, answers: AnswerMap): string | null {
  const key = normalizeQuestionKey(label);
  if (answers[key] != null && answers[key] !== "") return answers[key];

  const canonical = REVERSE_SYNONYMS[key];
  if (canonical && answers[canonical]) return answers[canonical];

  // substring heuristics for long-winded labels
  const k = key;
  const has = (frag: string) => k.includes(frag);
  if (has("full_name") || k === "name") {
    const full = [answers.first_name, answers.last_name].filter(Boolean).join(" ");
    if (full) return full;
  }
  if (has("first") && has("name")) return answers.first_name ?? null;
  if (has("last") && has("name")) return answers.last_name ?? null;
  if (has("email")) return answers.email ?? null;
  if (has("phone")) return answers.phone ?? null;
  if (has("linkedin")) return answers.linkedin_profile ?? null;
  if (has("github")) return answers.github_profile ?? null;
  if (has("website") || has("portfolio")) return answers.website ?? null;
  if (has("sponsor")) return answers.require_sponsorship ?? null;
  if (has("authorized") || has("authorization") || has("right_to_work")) return answers.work_authorization ?? null;
  if (has("employment_agreement") || has("post_employment") || has("non_compete") || has("restriction"))
    return answers.post_employment_restrictions ?? null;
  if (has("country")) return answers.country ?? null;
  if (has("located") && (has("united_states") || has("usa") || has("u_s")))
    return answers.located_in_us ?? null;
  if (has("salary") || has("compensation")) return answers.desired_salary ?? null;
  if (has("relocat")) return answers.willing_to_relocate ?? null;
  if (has("start") || has("notice") || has("availab")) return answers.notice_period ?? null;
  if (has("hear_about")) return answers.how_did_you_hear_about_this_job ?? null;
  if (has("cover_letter") || has("why_")) return answers.cover_letter ?? null;
  if (has("location") || has("city") || has("based")) return answers.location ?? null;
  if (has("hispanic") || has("latino")) return answers.hispanic_ethnicity ?? null;
  if (has("race") || has("ethnicity")) return answers.race ?? null;
  if (has("gender")) return answers.gender ?? null;
  if (has("veteran")) return answers.veteran_status ?? null;
  if (has("disability")) return answers.disability_status ?? null;
  return null;
}

/** Pick the select option that best corresponds to the stored answer. */
export function bestOption(answer: string, options: string[]): string | null {
  const a = answer.toLowerCase().trim();
  const exact = options.find((o) => o.toLowerCase().trim() === a);
  if (exact) return exact;
  const contains = options.find((o) => o.toLowerCase().includes(a) || a.includes(o.toLowerCase()));
  if (contains) return contains;
  // yes/no fuzzing
  if (/^(yes|y|true)/.test(a)) return options.find((o) => /^yes/i.test(o)) ?? null;
  if (/^(no|n|false)/.test(a)) return options.find((o) => /^no/i.test(o)) ?? null;
  return null;
}
