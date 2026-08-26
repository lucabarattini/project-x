import { hiringPostCompanies } from "./targets";

/**
 * Three query families so both the technical and the non-technical feed get
 * real coverage every cycle: generic outreach phrasing, engineering/data
 * roles, and business roles. maxPosts applies per query, so a run can return
 * up to queries × maxPosts candidates — and, just as importantly, a term added
 * to an existing family competes for that family's own budget rather than
 * enlarging the bill.
 *
 * The business family listed GTM titles only, so individual-contributor finance
 * roles never had a query of their own: every finance post in the feed arrived
 * through the generic family, where it competed with everything else a company
 * posted that day. That is why manager- and director-level finance roles came
 * through while "Financial Analyst" — a title the job boards carry constantly —
 * never did. The family runs well under its cap (2 of 15 on a sampled run), so
 * finance and analyst phrasing fits inside the existing budget.
 */
export const hiringPostSearchQueries = [
  "\"my team is hiring\" OR \"our team is hiring\" OR \"I'm hiring\" OR \"we're hiring\" OR \"hiring for\"",
  "\"hiring ML engineer\" OR \"hiring machine learning\" OR \"hiring a data scientist\" OR \"hiring software engineer\" OR \"team is hiring engineers\"",
  "\"hiring an account executive\" OR \"hiring a product manager\" OR \"hiring marketing\" OR \"hiring customer success\" OR \"hiring sales\" OR \"hiring operations\" OR \"hiring a financial analyst\" OR \"hiring a finance manager\" OR \"hiring an accountant\" OR \"hiring an analyst\"",
] as const;

export const hiringPostSearchQuery = hiringPostSearchQueries[0];

export const hiringPostScanCadenceHours = 4;

/**
 * Results per query per run. The LinkedIn Post Search actor applies maxPosts
 * per search query, so a run with the three query families returns up to
 * maxPosts × 3 candidates. Override via HIRING_POSTS_MAX_POSTS (Apify free
 * tier: results and profile scrapes are the main credit costs).
 */
const envMaxPosts = Number(process.env.HIRING_POSTS_MAX_POSTS);
export const hiringPostScheduledMaxPosts = Number.isFinite(envMaxPosts) && envMaxPosts > 0
  ? Math.min(envMaxPosts, 50)
  : 10;
/**
 * Sized so the rotation tiles the 24h postedLimit window exactly: 88 companies
 * at 16 per batch is 6 batches, and 6 x the 4h cadence is a 24h cycle. At 20
 * per batch the cycle was 20h against a 24h window, so 4h of every window was
 * re-fetched and re-billed each pass. Going lower opens a gap instead: 7
 * batches is a 28h cycle, and posts inside the missing 4h are never seen.
 */
export const hiringPostMaxCompaniesPerBatch = 16;

const companyBatchCount = Math.ceil(
  hiringPostCompanies.length / hiringPostMaxCompaniesPerBatch,
);

export const hiringPostCompanyBatches = Array.from(
  { length: companyBatchCount },
  (_, batchIndex) => hiringPostCompanies.filter((_, companyIndex) => (
    companyIndex % companyBatchCount === batchIndex
  )),
);

export const hiringPostCompanyCycleHours =
  hiringPostCompanyBatches.length * hiringPostScanCadenceHours;

export type HiringPostSearchWindow = "1h" | "24h" | "week";

export function buildLinkedinPostSearchInput(
  postedLimit: HiringPostSearchWindow = "24h",
  maxPosts = hiringPostScheduledMaxPosts,
  companyBatchIndex = 0,
) {
  const normalizedBatchIndex = (
    (companyBatchIndex % hiringPostCompanyBatches.length)
    + hiringPostCompanyBatches.length
  ) % hiringPostCompanyBatches.length;

  return {
    searchQueries: [...hiringPostSearchQueries],
    authorsCompanies: hiringPostCompanyBatches[normalizedBatchIndex],
    postedLimit,
    sortBy: "date" as const,
    maxPosts,
    contentType: "all" as const,
    profileScraperMode: "short" as const,
    scrapeComments: false,
    postNestedComments: false,
    scrapeReactions: false,
    postNestedReactions: false,
  };
}

export function findHiringPostCompanyBatchIndex(companies: unknown) {
  if (!Array.isArray(companies) || !companies.every((company) => typeof company === "string")) {
    return -1;
  }

  const values = new Set(companies);
  return hiringPostCompanyBatches.findIndex((batch) => (
    batch.length === values.size && batch.every((company) => values.has(company))
  ));
}

export function nextHiringPostCompanyBatchIndex(companies: unknown) {
  const currentBatchIndex = findHiringPostCompanyBatchIndex(companies);
  return currentBatchIndex < 0
    ? 0
    : (currentBatchIndex + 1) % hiringPostCompanyBatches.length;
}

export function projectedMonthlyPostMaximum(days = 31) {
  return Math.ceil((24 / hiringPostScanCadenceHours) * days)
    * hiringPostScheduledMaxPosts
    * hiringPostSearchQueries.length;
}
