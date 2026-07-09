// Curated directory of public ATS job boards to sweep. Each entry is a company's
// board token on that ATS. These are public, unauthenticated JSON APIs published
// by the ATS vendors themselves for embedding job boards.
//
// Extend freely — anything at boards.greenhouse.io/<token>, jobs.lever.co/<token>,
// or jobs.ashbyhq.com/<token> works.

export const GREENHOUSE_BOARDS: string[] = [
  "stripe",
  "airbnb",
  "cloudflare",
  "databricks",
  "figma",
  "gitlab",
  "robinhood",
  "coinbase",
  "doordashusa",
  "dropbox",
  "duolingo",
  "flexport",
  "instacart",
  "lyft",
  "mongodb",
  "pinterest",
  "reddit",
  "samsara",
  "scaleai",
  "twilio",
];

export const LEVER_BOARDS: string[] = [
  "netflix",
  "plaid",
  "palantir",
  "voleon",
  "attentive",
  "veeva",
  "octoenergy",
  "mistral",
  "kraken123",
];

export const ASHBY_BOARDS: string[] = [
  "openai",
  "notion",
  "linear",
  "ramp",
  "replit",
  "vanta",
  "supabase",
  "deel",
  "sierra",
  "cursor",
];
