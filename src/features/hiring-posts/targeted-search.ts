import { hiringPostCompanies } from "./targets";
import type { HiringPostSearchWindow } from "./search-config";

/**
 * A one-off, hand-aimed search — separate from the scheduled rotation.
 *
 * The scheduled task tiles all 89 companies across a 24h cycle with three
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

export type TargetedSearchOptions = {
  companies: string[];
  queries?: readonly string[];
  postedLimit?: HiringPostSearchWindow;
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
