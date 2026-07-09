/**
 * Resume-to-job matching, modeled on how commercial resume-match tools
 * (Jobscan, Teal, etc.) score fit rather than a rigid checklist:
 *
 *  - Weighted keyword coverage: hard skills extracted from the job
 *    description dominate the score, weighted by how often the JD mentions
 *    them and whether they appear in a requirements section. Soft skills,
 *    title alignment, education, and other repeated keywords contribute less.
 *  - Forgiving credit: synonyms count fully (Postgres == PostgreSQL,
 *    K8s == Kubernetes), and skills in the same family earn partial credit
 *    (knowing Vue when the JD says React is worth something, not zero).
 *  - Calibrated scale: the raw coverage ratio is mapped through a curve so
 *    scores land on the same scale those tools use, where a solid fit reads
 *    ~75-90% and a strong fit 90%+.
 */

export interface MatchResult {
  score: number;
  breakdown: {
    /** 0-100 coverage of JD hard skills (the dominant factor) */
    hardSkills: number;
    /** 0-100 coverage of JD soft skills */
    softSkills: number;
    /** 0-100 job-title alignment */
    title: number;
    /** 0-100 coverage of other repeated JD keywords */
    keywords: number;
    /** signed % adjustment from experience/education checks */
    adjustments: number;
  };
  matchedSkills: string[];
  missingSkills: string[];
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// Hard-skill dictionary spanning engineering, data, product, design, sales, ops.
const HARD_SKILLS = [
  "javascript","typescript","python","java","go","rust","c++","c#","ruby","php","swift","kotlin","scala","sql","html","css","bash","r",
  "react","next.js","vue","angular","svelte","node.js","express","django","flask","fastapi","rails","spring","graphql","rest","grpc",
  "machine learning","deep learning","nlp","llm","pytorch","tensorflow","scikit-learn","pandas","numpy","spark","hadoop","airflow","dbt","etl","snowflake","bigquery","redshift","databricks","tableau","looker","power bi","a/b testing","statistics","experimentation","data analysis","data visualization","data modeling","data warehouse",
  "aws","gcp","azure","kubernetes","docker","terraform","ci/cd","jenkins","github actions","linux","postgresql","mysql","sqlite","mongodb","redis","kafka","rabbitmq","elasticsearch","dynamodb","cassandra","microservices","serverless","observability","datadog","prometheus","grafana",
  "security","penetration testing","soc 2","compliance","iam","encryption","oauth","networking",
  "product management","roadmap","user research","product strategy","go-to-market","okrs","agile","scrum","kanban","jira","confluence","figma","sketch","prototyping","wireframing","design systems","ux","ui","usability testing","customer discovery","product analytics","amplitude","mixpanel","segment","sql reporting",
  "salesforce","hubspot","crm","account management","business development","partnerships","forecasting","pipeline management","saas","b2b","b2c","enterprise sales","customer success","onboarding","retention","churn","upsell","marketing","seo","sem","content marketing","email marketing","paid acquisition","growth","branding","copywriting","social media",
  "excel","financial modeling","fp&a","accounting","gaap","budgeting","procurement","supply chain","logistics","project management","pmp","six sigma","lean","operations","recruiting","sourcing","hris","payroll","vendor management",
];

// Alternate spellings that count as an exact match.
const SYNONYMS: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  "node.js": ["node", "nodejs"],
  "next.js": ["nextjs", "next js"],
  react: ["react.js", "reactjs"],
  vue: ["vue.js", "vuejs"],
  angular: ["angularjs"],
  go: ["golang"],
  postgresql: ["postgres", "psql"],
  mysql: ["my sql"],
  kubernetes: ["k8s"],
  "ci/cd": ["cicd", "continuous integration", "continuous delivery", "continuous deployment"],
  "github actions": ["gh actions"],
  aws: ["amazon web services"],
  gcp: ["google cloud", "google cloud platform"],
  azure: ["microsoft azure"],
  "machine learning": ["ml"],
  "deep learning": ["neural networks"],
  nlp: ["natural language processing"],
  llm: ["large language model", "large language models", "genai", "generative ai"],
  "scikit-learn": ["sklearn", "scikit learn"],
  "a/b testing": ["ab testing", "a b testing", "split testing"],
  "power bi": ["powerbi"],
  "product management": ["product manager"],
  okrs: ["okr", "objectives and key results"],
  ux: ["user experience"],
  ui: ["user interface"],
  "go-to-market": ["gtm", "go to market"],
  crm: ["customer relationship management"],
  "customer success": ["client success"],
  seo: ["search engine optimization"],
  sem: ["search engine marketing"],
  "fp&a": ["financial planning and analysis", "fp and a"],
  "project management": ["program management"],
  "user research": ["customer research"],
  "data analysis": ["data analytics"],
  "data visualization": ["data viz", "dashboards", "dashboarding"],
  etl: ["elt", "data pipelines", "data pipeline"],
  rest: ["restful", "rest apis", "rest api"],
  microservices: ["micro-services", "service oriented architecture"],
  experimentation: ["experiments"],
};

// Families of related skills. Having a sibling earns partial credit — the way
// a recruiter reads "Vue" on a resume for a React role.
const SKILL_FAMILIES: string[][] = [
  ["react", "next.js", "vue", "angular", "svelte"],
  ["javascript", "typescript", "node.js"],
  ["python", "ruby", "php"],
  ["java", "kotlin", "scala", "c#"],
  ["go", "rust", "c++"],
  ["express", "django", "flask", "fastapi", "rails", "spring"],
  ["sql", "postgresql", "mysql", "sqlite"],
  ["mongodb", "redis", "dynamodb", "cassandra", "elasticsearch"],
  ["aws", "gcp", "azure"],
  ["kubernetes", "docker", "terraform", "ci/cd", "jenkins", "github actions"],
  ["pytorch", "tensorflow", "scikit-learn", "machine learning", "deep learning"],
  ["pandas", "numpy", "spark", "airflow", "dbt", "etl"],
  ["snowflake", "bigquery", "redshift", "databricks", "data warehouse"],
  ["tableau", "looker", "power bi", "data visualization"],
  ["amplitude", "mixpanel", "segment", "product analytics"],
  ["kafka", "rabbitmq"],
  ["graphql", "rest", "grpc"],
  ["figma", "sketch", "prototyping", "wireframing", "design systems"],
  ["agile", "scrum", "kanban", "jira"],
  ["salesforce", "hubspot", "crm"],
  ["seo", "sem", "paid acquisition", "content marketing", "email marketing"],
  ["a/b testing", "experimentation", "statistics"],
  ["product management", "product strategy", "roadmap"],
  ["user research", "customer discovery", "usability testing"],
  ["excel", "financial modeling", "fp&a", "budgeting"],
];

const SOFT_SKILLS = [
  "communication","leadership","collaboration","cross-functional","problem solving","teamwork","mentoring","mentorship","ownership","stakeholder management","prioritization","analytical","detail-oriented","self-starter","adaptability","presentation","negotiation","strategic thinking","time management","empathy","curiosity","initiative","fast-paced","organized","creative",
];

const EDUCATION_TERMS = ["bachelor","master","phd","mba","b.s.","m.s.","bsc","msc","degree in","computer science degree","engineering degree","quantitative field"];

const STOPWORDS = new Set(
  "a,an,the,and,or,but,of,to,in,on,for,with,at,by,from,as,is,are,was,were,be,been,being,have,has,had,do,does,did,will,would,can,could,should,may,might,you,your,yours,we,our,ours,they,their,it,its,this,that,these,those,not,no,so,if,than,then,there,here,about,into,over,after,before,between,out,up,down,off,all,each,more,most,other,some,such,only,own,same,too,very,just,also,within,across,per,via,etc,who,what,which,when,where,how,while,because,during,both,any,role,team,teams,work,working,works,job,candidate,candidates,experience,years,year,strong,ability,skills,skill,including,include,includes,required,requirements,preferred,plus,must,least,help,new,make,build,building,well,best,great,good,like,looking,join,us,day,every,part,one,two,using,use,used,able,etc".split(",")
);

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does the text contain this term (or a synonym) as a whole word/phrase? */
function containsTerm(haystackPadded: string, term: string): boolean {
  const variants = [term, ...(SYNONYMS[term] ?? [])];
  return variants.some((v) =>
    new RegExp(`[^a-z0-9]${escapeRegex(v)}[^a-z0-9]`).test(haystackPadded)
  );
}

/** Count whole-word occurrences of a term (including synonyms). */
function countTerm(haystackPadded: string, term: string): number {
  const variants = [term, ...(SYNONYMS[term] ?? [])];
  let n = 0;
  for (const v of variants) {
    n += (haystackPadded.match(new RegExp(`[^a-z0-9]${escapeRegex(v)}[^a-z0-9]`, "g")) ?? []).length;
  }
  return n;
}

function pad(text: string): string {
  return ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
}

/** Light stemmer so "designing" matches "design", "reports" matches "report". */
function stem(word: string): string {
  return word
    .replace(/'s$/, "")
    .replace(/(ings|ing)$/, "")
    .replace(/(ies)$/, "y")
    .replace(/(es|s)$/, "")
    .replace(/(ed)$/, "");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./&\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function familyOf(skill: string): string[] {
  return SKILL_FAMILIES.find((f) => f.includes(skill)) ?? [];
}

/** Extract the requirements/qualifications section of a JD, if it has one. */
function requirementsSection(jd: string): string {
  const lines = jd.split("\n");
  const startRe = /(requirements|qualifications|what you.{0,3}ll need|must have|who you are|what we.{0,3}re looking for|about you|you have|you bring)/i;
  const endRe = /(benefits|perks|compensation|about us|about the company|why join|what we offer|our stack|interview process|equal opportunity)/i;
  let capturing = false;
  const captured: string[] = [];
  for (const line of lines) {
    if (!capturing && startRe.test(line) && line.trim().length < 80) capturing = true;
    else if (capturing && endRe.test(line) && line.trim().length < 80) break;
    else if (capturing) captured.push(line);
  }
  return captured.join("\n");
}

function extractYearsRequired(jd: string): number | null {
  const m = jd.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  return m ? Math.min(parseInt(m[1], 10), 15) : null;
}

function estimateYearsFromResume(resume: string): number | null {
  const years = [...resume.matchAll(/\b(19[89]\d|20[0-3]\d)\b/g)]
    .map((m) => parseInt(m[1], 10))
    .filter((y) => y <= new Date().getFullYear());
  if (years.length < 2) return null; // unknown, not zero
  return Math.min(Math.max(...years) - Math.min(...years), 30);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface Requirement {
  name: string;
  weight: number;
  credit: number; // 0..1
}

export function computeMatch(resumeText: string, jobTitle: string, jobDescription: string): MatchResult {
  const jd = pad(jobDescription + " " + jobTitle);
  const resume = pad(resumeText);
  const reqSection = pad(requirementsSection(jobDescription));
  const resumeStems = new Set(tokenize(resumeText).map(stem));

  const requirements: Requirement[] = [];
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  // --- Hard skills: the dominant factor. Weight scales with JD emphasis. ---
  interface SkillHit {
    skill: string;
    weight: number;
    credit: number;
    via?: string;
  }
  const hits: SkillHit[] = [];
  for (const skill of HARD_SKILLS) {
    if (!containsTerm(jd, skill)) continue;
    const freq = countTerm(jd, skill);
    const inReqs = containsTerm(reqSection, skill);
    const weight = (2 + Math.min(freq - 1, 3) * 0.5) * (inReqs ? 1.5 : 1);

    let credit = 0;
    let via: string | undefined;
    if (containsTerm(resume, skill)) {
      credit = 1;
    } else {
      const sibling = familyOf(skill).find((s) => s !== skill && containsTerm(resume, s));
      if (sibling) {
        credit = 0.55; // related-family partial credit
        via = sibling;
      }
    }
    hits.push({ skill, weight, credit, via });
  }

  // JDs list same-family skills as alternatives ("React or Vue", "Postgres or
  // MySQL") — a candidate needs one, not all. Collapse each such group into a
  // single requirement scored by its best-covered member.
  const GENERAL_LANGUAGES = new Set(["javascript","typescript","python","java","go","rust","c++","c#","ruby","php","swift","kotlin","scala"]);
  const langHits = hits.filter((h) => GENERAL_LANGUAGES.has(h.skill));
  const grouped: SkillHit[] = [];
  const consumed = new Set<string>();

  // Three-plus languages named means "any mainstream language" (polyglot shops
  // like Stripe list Java/Ruby/Go/Scala as examples, not a checklist).
  if (langHits.length >= 3) {
    for (const h of langHits) consumed.add(h.skill);
    const best = Math.max(...langHits.map((h) => h.credit));
    const resumeHasAnyLanguage = [...GENERAL_LANGUAGES].some((l) => containsTerm(resume, l));
    grouped.push({
      skill: langHits.map((h) => h.skill).join("/"),
      weight: Math.max(...langHits.map((h) => h.weight)) * 1.25,
      credit: Math.max(best, resumeHasAnyLanguage ? 0.85 : 0),
    });
  }

  for (const family of SKILL_FAMILIES) {
    const members = hits.filter((h) => family.includes(h.skill) && !consumed.has(h.skill));
    if (members.length < 2) continue;
    for (const m of members) consumed.add(m.skill);
    const best = members.reduce((a, b) => (b.credit > a.credit ? b : a));
    grouped.push({
      skill: members.map((h) => h.skill).join("/"),
      weight: Math.max(...members.map((h) => h.weight)) * 1.25,
      credit: best.credit,
      via: best.via,
    });
  }
  for (const h of hits) if (!consumed.has(h.skill)) grouped.push(h);

  // Commercial tools score against the top priority skills, not every term a
  // long JD happens to mention — cap to the highest-weighted requirements.
  grouped.sort((a, b) => b.weight - a.weight);
  const prioritized = grouped.slice(0, 14);

  let hardWeight = 0;
  let hardEarned = 0;
  for (const h of prioritized) {
    if (h.credit >= 1) matchedSkills.push(h.skill);
    else if (h.credit > 0) matchedSkills.push(`${h.skill}${h.via ? ` (via ${h.via})` : ""}`);
    else missingSkills.push(h.skill);
    requirements.push({ name: h.skill, weight: h.weight, credit: h.credit });
    hardWeight += h.weight;
    hardEarned += h.weight * h.credit;
  }

  // --- Soft skills: low weight, generous stem matching. ---
  let softWeight = 0;
  let softEarned = 0;
  for (const skill of SOFT_SKILLS) {
    if (!containsTerm(jd, skill)) continue;
    const weight = 0.5;
    const credit = containsTerm(resume, skill) || resumeStems.has(stem(skill.split(" ")[0])) ? 1 : 0;
    requirements.push({ name: skill, weight, credit });
    softWeight += weight;
    softEarned += weight * credit;
  }

  // --- Title alignment: JD title words (minus seniority) found in resume. ---
  const seniority = new Set(["senior","staff","junior","lead","principal","sr","jr","ii","iii","iv","head","director","vp","associate","intern"]);
  const titleWords = tokenize(jobTitle).filter((w) => !seniority.has(w));
  let titleWeight = 0;
  let titleEarned = 0;
  for (const word of titleWords) {
    const weight = 1.25;
    const credit = resumeStems.has(stem(word)) ? 1 : 0;
    requirements.push({ name: `title:${word}`, weight, credit });
    titleWeight += weight;
    titleEarned += weight * credit;
  }

  // --- Other repeated JD keywords: low weight, stem-matched. ---
  const skillTokens = new Set(HARD_SKILLS.flatMap((s) => s.split(/[\s./]+/)));
  const freq = new Map<string, number>();
  for (const tok of tokenize(jobDescription)) {
    const s = stem(tok);
    if (skillTokens.has(tok) || skillTokens.has(s)) continue;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  const repeated = [...freq.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 15);
  let kwWeight = 0;
  let kwEarned = 0;
  for (const [word] of repeated) {
    const weight = 0.35;
    const credit = resumeStems.has(word) ? 1 : 0;
    requirements.push({ name: `kw:${word}`, weight, credit });
    kwWeight += weight;
    kwEarned += weight * credit;
  }

  // --- Coverage ratio ---
  const totalWeight = requirements.reduce((s, r) => s + r.weight, 0);
  const earned = requirements.reduce((s, r) => s + r.weight * r.credit, 0);
  // A JD our extractors can't read at all shouldn't nuke the score to 0.
  let raw = totalWeight > 0 ? earned / totalWeight : 0.6;

  // --- Adjustments: only penalize clear, high-confidence gaps. ---
  let adjustments = 0;
  const yearsRequired = extractYearsRequired(jobDescription);
  const yearsHave = estimateYearsFromResume(resumeText);
  if (yearsRequired !== null && yearsHave !== null && yearsHave + 2 < yearsRequired) {
    raw *= 0.92; // clearly short on experience
    adjustments -= 8;
  }
  const jdWantsDegree = EDUCATION_TERMS.some((t) => jd.includes(t));
  const resumeHasDegree = EDUCATION_TERMS.some((t) => resume.includes(t)) || /university|college|b\.a\.|b\.s\.|bachelor/i.test(resumeText);
  if (jdWantsDegree && !resumeHasDegree) {
    raw *= 0.96;
    adjustments -= 4;
  }

  // --- Calibration: map coverage to the scale commercial tools use. ---
  // raw 0.85 -> ~92, 0.70 -> ~82, 0.50 -> ~68, 0.30 -> ~52, 0.10 -> ~28
  const score = Math.max(0, Math.min(98, Math.round(100 * Math.pow(raw, 0.55))));

  const pct = (e: number, w: number) => (w > 0 ? Math.round((e / w) * 100) : 100);
  return {
    score,
    breakdown: {
      hardSkills: pct(hardEarned, hardWeight),
      softSkills: pct(softEarned, softWeight),
      title: pct(titleEarned, titleWeight),
      keywords: pct(kwEarned, kwWeight),
      adjustments,
    },
    matchedSkills,
    missingSkills,
  };
}
