/**
 * ATS-style resume-to-job matching.
 *
 * Mirrors how applicant tracking systems score fit: hard-skill keyword overlap
 * dominates, then title alignment, experience requirements, education, and
 * general keyword coverage. Returns a 0-100 percentage plus a breakdown the UI
 * can show ("why is this 87%?").
 */

export interface MatchResult {
  score: number;
  breakdown: {
    skills: number;
    title: number;
    experience: number;
    education: number;
    keywords: number;
  };
  matchedSkills: string[];
  missingSkills: string[];
}

// Skills dictionary spanning engineering, data, product, design, sales, ops.
const SKILLS = [
  // Languages & frameworks
  "javascript","typescript","python","java","golang","go","rust","c++","c#","ruby","php","swift","kotlin","scala","sql","html","css","bash",
  "react","next.js","vue","angular","svelte","node.js","node","express","django","flask","fastapi","rails","spring","graphql","rest",
  // Data / ML
  "machine learning","deep learning","nlp","llm","pytorch","tensorflow","scikit-learn","pandas","numpy","spark","hadoop","airflow","dbt","etl","data warehouse","snowflake","bigquery","redshift","databricks","tableau","looker","power bi","a/b testing","statistics","experimentation",
  // Infra
  "aws","gcp","azure","kubernetes","docker","terraform","ci/cd","jenkins","github actions","linux","postgresql","postgres","mysql","mongodb","redis","kafka","rabbitmq","elasticsearch","grpc","microservices","serverless","observability","datadog","prometheus",
  // Security
  "security","penetration testing","soc 2","compliance","iam","encryption","oauth",
  // Product / design
  "product management","roadmap","user research","product strategy","go-to-market","gtm","okrs","agile","scrum","kanban","jira","figma","sketch","prototyping","wireframing","design systems","ux","ui","user experience","usability testing","customer discovery","stakeholder management","analytics","amplitude","mixpanel","segment",
  // Business
  "salesforce","hubspot","crm","account management","business development","partnerships","negotiation","forecasting","pipeline","quota","saas","b2b","b2c","enterprise sales","customer success","onboarding","retention","churn","upsell","marketing","seo","sem","content marketing","email marketing","paid acquisition","growth","branding","copywriting",
  // Ops / finance
  "excel","financial modeling","fp&a","accounting","gaap","budgeting","procurement","supply chain","logistics","project management","pmp","six sigma","lean","operations","recruiting","sourcing","hris","payroll",
];

const EDUCATION_TERMS = ["bachelor","master","phd","mba","b.s","m.s","bs ","ms ","degree","computer science","engineering degree"];

const STOPWORDS = new Set(
  "a,an,the,and,or,but,of,to,in,on,for,with,at,by,from,as,is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,may,might,you,your,we,our,they,their,it,its,this,that,these,those,not,no,so,if,than,then,there,here,about,into,over,after,before,between,out,up,down,off,all,each,more,most,other,some,such,only,own,same,too,very,just,also,within,across,per,via,etc,who,what,which,when,where,how,role,team,work,working,job,candidate,experience,years,strong,ability,skills,including,required,preferred,plus,must,least".split(",")
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function extractSkills(text: string): Set<string> {
  const lower = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const found = new Set<string>();
  for (const skill of SKILLS) {
    // word-boundary-ish match so "go" doesn't hit "google"
    const pattern = new RegExp(`[^a-z0-9]${skill.replace(/[.+#/]/g, "\\$&")}[^a-z0-9]`, "i");
    if (pattern.test(lower)) found.add(skill);
  }
  // collapse aliases
  if (found.has("node")) { found.delete("node"); found.add("node.js"); }
  if (found.has("golang")) { found.delete("golang"); found.add("go"); }
  if (found.has("postgres")) { found.delete("postgres"); found.add("postgresql"); }
  return found;
}

function extractYearsRequired(jd: string): number | null {
  const m = jd.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  return m ? Math.min(parseInt(m[1], 10), 15) : null;
}

function estimateYearsFromResume(resume: string): number {
  // Longest span of 4-digit years mentioned (employment history heuristic)
  const years = [...resume.matchAll(/\b(19[89]\d|20[0-2]\d)\b/g)]
    .map((m) => parseInt(m[1], 10))
    .filter((y) => y <= new Date().getFullYear());
  if (years.length < 2) return 0;
  return Math.min(Math.max(...years) - Math.min(...years), 30);
}

export function computeMatch(resumeText: string, jobTitle: string, jobDescription: string): MatchResult {
  const jdSkills = extractSkills(jobDescription + " " + jobTitle);
  const resumeSkills = extractSkills(resumeText);

  // --- Skills (50 pts): fraction of JD skills present in resume ---
  const matchedSkills = [...jdSkills].filter((s) => resumeSkills.has(s));
  const missingSkills = [...jdSkills].filter((s) => !resumeSkills.has(s));
  const skillRatio = jdSkills.size > 0 ? matchedSkills.length / jdSkills.size : 0.6;
  const skills = Math.round(skillRatio * 50);

  // --- Title alignment (20 pts): JD title words present in resume ---
  const titleWords = tokenize(jobTitle).filter((w) => !["senior","staff","junior","lead","principal","sr","jr","ii","iii"].includes(w));
  const resumeLower = resumeText.toLowerCase();
  const titleHits = titleWords.filter((w) => resumeLower.includes(w));
  const title = Math.round((titleWords.length ? titleHits.length / titleWords.length : 0.5) * 20);

  // --- Experience (15 pts) ---
  const required = extractYearsRequired(jobDescription);
  const has = estimateYearsFromResume(resumeText);
  let experience: number;
  if (required === null) experience = 11; // JD silent on years: mostly-full credit
  else if (has >= required) experience = 15;
  else if (required > 0) experience = Math.round((has / required) * 15);
  else experience = 11;

  // --- Education (5 pts) ---
  const jdWantsDegree = EDUCATION_TERMS.some((t) => jobDescription.toLowerCase().includes(t));
  const resumeHasDegree = EDUCATION_TERMS.some((t) => resumeLower.includes(t));
  const education = !jdWantsDegree ? 4 : resumeHasDegree ? 5 : 1;

  // --- General keyword coverage (10 pts): top JD terms found in resume ---
  const freq = new Map<string, number>();
  for (const tok of tokenize(jobDescription)) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  const topTerms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w]) => w);
  const resumeTokens = new Set(tokenize(resumeText));
  const covered = topTerms.filter((t) => resumeTokens.has(t));
  const keywords = Math.round((topTerms.length ? covered.length / topTerms.length : 0.5) * 10);

  const score = Math.min(100, skills + title + experience + education + keywords);
  return {
    score,
    breakdown: { skills, title, experience, education, keywords },
    matchedSkills,
    missingSkills,
  };
}
