import { hiringPostCompanies } from "./targets";

/**
 * A one-off, hand-aimed search — separate from the scheduled rotation.
 *
 * The scheduled task tiles all 93 companies across a 24h cycle with three
 * broad query families, which is the right shape for standing coverage and
 * the wrong shape for "find me people at these three companies who said DM
 * me". This builds an input for that second question and nothing else: it is
 * never written to the task, so running it cannot disturb the rotation's
 * position, window, or budget.
 */

/**
 * Phrasings that put a person on the other end rather than a link. These are
 * the posts worth acting on: the author is inviting a message, so a reply
 * reaches a human who owns the role instead of an application queue.
 */
export const outreachSearchQueries = [
  "\"DM me if you're interested\" OR \"DM me if interested\" OR \"send me a DM\" OR \"message me if you're interested\" OR \"shoot me a message\"",
  "\"reach out if you're interested\" OR \"reach out if interested\" OR \"feel free to reach out\" OR \"drop me a note\" OR \"comment below if interested\"",
] as const;

/**
 * Accounting, audit and financial-reporting openings.
 *
 * Shaped by what the Actor actually answers. Full literal sentences —
 * "hiring a financial analyst" — matched almost nothing: LinkedIn indexes the
 * post, not the sentence, and a week of four companies rarely contains the
 * exact wording. A bare discipline word returns the whole finance internet
 * instead. What lands is a quoted role title next to the hiring keyword, which
 * pins the discipline without demanding the author phrase it our way.
 */
export const financeSearchQueries = [
  "hiring \"financial analyst\" OR hiring \"senior financial analyst\" OR hiring \"staff accountant\" OR hiring \"senior accountant\" OR hiring \"accounting manager\"",
  "hiring \"internal audit\" OR hiring \"audit manager\" OR hiring \"financial reporting\" OR hiring \"technical accounting\" OR hiring \"controller\"",
  "hiring \"finance manager\" OR hiring \"FP&A\" OR hiring \"accounts payable\" OR hiring \"revenue accounting\" OR hiring \"financial controller\"",
] as const;

/**
 * Product, program and technical-program openings.
 *
 * Same shape as the finance family, for the same reason: a quoted role title
 * next to the hiring keyword. The three queries are split by title rather than
 * by seniority because maxPosts is applied per query — "senior program
 * manager" alongside "program manager" would spend a second query's budget
 * re-finding posts the shorter phrase already matches, since LinkedIn matches
 * the phrase inside the longer title.
 */
export const productSearchQueries = [
  "hiring \"product manager\" OR hiring \"senior product manager\" OR hiring \"principal product manager\" OR hiring \"group product manager\" OR hiring \"product management\"",
  "hiring \"technical program manager\" OR hiring \"technical product manager\" OR hiring \"TPM\" OR hiring \"program manager\" OR hiring \"PM-T\"",
  "hiring \"product owner\" OR hiring \"head of product\" OR hiring \"director of product\" OR hiring \"product lead\" OR hiring \"principal program manager\"",
] as const;

/**
 * The families a run can aim with, by name. Adding one here is what makes it
 * reachable from the script's --queries flag.
 */
export const targetedSearchQueryFamilies = {
  outreach: outreachSearchQueries,
  finance: financeSearchQueries,
  product: productSearchQueries,
} as const;

export type TargetedSearchQueryFamily = keyof typeof targetedSearchQueryFamilies;

export function isTargetedSearchQueryFamily(
  value: string,
): value is TargetedSearchQueryFamily {
  return Object.hasOwn(targetedSearchQueryFamilies, value);
}

/**
 * The role titles a family is trying to surface, so a report can lead with the
 * discipline it found instead of the first lines of the post. They live next
 * to the queries deliberately: a family whose queries ask for one discipline
 * and whose report highlights another reads as "no matches" when the run
 * actually worked.
 *
 * Longest titles first — alternation returns the first branch that matches, so
 * "product manager" placed ahead of "technical program manager" would label
 * every TPM post as a PM one.
 */
const financeTitlePattern = "\\b(?:senior financial analyst|financial analyst|staff accountant|senior accountant|accounting manager|accountant|internal audit(?:or)?|audit manager|auditor|financial reporting|technical accounting|finance manager|financial controller|controller|FP&A|accounts payable|accounts receivable|revenue accounting|tax manager|assurance)\\b";

const productTitlePattern = "\\b(?:senior technical program manager|technical program manager|technical product manager|principal product manager|senior product manager|group product manager|principal program manager|senior program manager|product marketing manager|director of product|head of product|product manager|program manager|product management|product owner|product lead|TPMs?|PM-Ts?)\\b";

/**
 * Outreach is aimed at a phrasing rather than a discipline, so it highlights
 * whatever any discipline family looks for.
 */
const anyTitlePattern = `${financeTitlePattern}|${productTitlePattern}`;

const titlePatternsByFamily: Record<TargetedSearchQueryFamily, string> = {
  outreach: anyTitlePattern,
  finance: financeTitlePattern,
  product: productTitlePattern,
};

/**
 * Built fresh per call rather than shared: a /g/ regex carries lastIndex
 * between calls, so one instance reused across posts silently skips matches
 * on every other post.
 */
export function targetedSearchTitleMatcher(family: TargetedSearchQueryFamily | null) {
  return new RegExp(family ? titlePatternsByFamily[family] : anyTitlePattern, "giu");
}

/**
 * The scheduled rotation never looks back further than its 24h tile, so the
 * app's window type stops at a week. A hand-aimed run is the opposite case:
 * narrow phrasing at one company can go a whole week without a single post, so
 * it needs the longer reach the Actor already supports.
 *
 * These are the Actor's own values minus "any". An unbounded window is not a
 * budget risk — maxPosts still caps the bill — but it silently trades the
 * recent posts a person can still act on for whatever ranked highest years
 * ago, which is never what a hand-aimed search wants.
 */
export const targetedSearchWindows = [
  "1h", "24h", "week", "month", "3months", "6months", "year",
] as const;

export type TargetedSearchWindow = (typeof targetedSearchWindows)[number];

export function isTargetedSearchWindow(value: string): value is TargetedSearchWindow {
  return (targetedSearchWindows as readonly string[]).includes(value);
}

export type TargetedSearchOptions = {
  companies: string[];
  queries?: readonly string[];
  postedLimit?: TargetedSearchWindow;
  maxPosts?: number;
};

/** Apify bills per result, so a stray zero in maxPosts is a billing event. */
export const targetedSearchMaxPostsCeiling = 50;

export function buildTargetedPostSearchInput({
  companies,
  queries = outreachSearchQueries,
  postedLimit = "week",
  maxPosts = 25,
}: TargetedSearchOptions) {
  if (companies.length === 0) {
    throw new Error("A targeted search needs at least one company");
  }
  if (queries.length === 0) {
    throw new Error("A targeted search needs at least one query");
  }
  if (!isTargetedSearchWindow(postedLimit)) {
    throw new Error(
      `Unknown window "${postedLimit}". Known: ${targetedSearchWindows.join(", ")}`,
    );
  }

  return {
    searchQueries: [...queries],
    authorsCompanies: [...companies],
    postedLimit,
    sortBy: "date" as const,
    maxPosts: Math.min(targetedSearchMaxPostsCeiling, Math.max(1, Math.floor(maxPosts))),
    contentType: "all" as const,
    profileScraperMode: "short" as const,
    scrapeComments: false,
    postNestedComments: false,
    scrapeReactions: false,
    postNestedReactions: false,
  };
}

/**
 * Companies the feed cannot attribute are dropped at normalization, so a
 * search aimed at one is billed and then discarded. Catch it before the run.
 */
export function untrackedCompanies(companies: string[]) {
  const known = new Set(hiringPostCompanies);
  return companies.filter((company) => !known.has(company));
}

/** maxPosts applies per query, so the ceiling multiplies across the families. */
export function targetedSearchResultCeiling(queryCount: number, maxPosts: number) {
  return queryCount * maxPosts;
}
