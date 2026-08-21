import {
  defaultExperienceFilters,
  defaultRoleTracks,
  roleTrackFromId,
  roleTrackIds,
} from "./dashboard/config";
import {
  type DateFilter,
  type CountryFilter,
  type JobSortKey,
  type SortDirection,
  matchesCompany,
  matchesCountry,
  matchesDate,
  matchesLocation,
} from "./filters";
import {
  matchesExperienceFilter,
  nonTechnicalFamilies,
  nonTechnicalFamilyOptions,
  type ExperienceFilter,
  type NonTechnicalFamily,
  type RoleTypeFilter,
} from "./display";
import {
  type JobListItem,
  type JobSearchEntry,
  toJobListItem,
} from "./search-model";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;

export type PortalId = "tech" | "non-tech";

const nonTechnicalFamilyIds: Record<NonTechnicalFamily, string> = {
  "Sales & Partnerships": "sales",
  "Marketing & Communications": "marketing",
  "Design & Creative": "design",
  "Customer Success & Support": "customer",
  "Product & Program": "product",
  "Finance & Accounting": "finance",
  "Operations & Supply Chain": "operations",
  "Analytics & Strategy": "analytics",
  Other: "other",
};

const nonTechnicalFamilyById = new Map(
  Object.entries(nonTechnicalFamilyIds).map(([family, id]) => [id, family] as const),
);

export type JobSearchParams = {
  portal: PortalId;
  q: string;
  company: string | null;
  country: CountryFilter;
  locations: string[];
  date: DateFilter;
  experience: ExperienceFilter[];
  roleTypes: RoleTypeFilter[];
  /** Role-family filter used by the non-technical portal. */
  families: NonTechnicalFamily[];
  sort: JobSortKey;
  dir: SortDirection;
  limit: number;
};

export const defaultSearchParams: JobSearchParams = {
  portal: "tech",
  q: "",
  company: null,
  country: "us",
  locations: [],
  date: "today",
  experience: [...defaultExperienceFilters],
  roleTypes: [...defaultRoleTracks],
  families: [...nonTechnicalFamilies],
  sort: "postedAt",
  dir: "desc",
  limit: DEFAULT_PAGE_SIZE,
};

const validDates = new Set<DateFilter>([
  "all", "today", "6h", "12h", "24h", "48h", "3d", "week", "2w",
]);
const validSortKeys = new Set<JobSortKey>([
  "title", "company", "experience", "location", "postedAt", "updatedAt",
]);

export type JobSearchResult = {
  jobs: JobListItem[];
  nextCursor: string | null;
  total: number;
  companies: number;
  offset: number;
};

function firstString(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function commaList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}

/** Parse a request searchParams object into typed filters. */
export function parseSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): JobSearchParams {
  const params: JobSearchParams = {
    ...defaultSearchParams,
  };

  const q = firstString(searchParams.q);
  if (q) params.q = q.slice(0, 200);

  const company = firstString(searchParams.company);
  if (company) params.company = company.slice(0, 120);

  const country = firstString(searchParams.country);
  if (country === "all" || country === "us") params.country = country;

  const locations = commaList(searchParams.loc);
  params.locations = locations.slice(0, 12);

  const date = firstString(searchParams.date) as DateFilter | undefined;
  if (date && validDates.has(date)) params.date = date;

  const experience = commaList(searchParams.exp).filter((id): id is ExperienceFilter =>
    id === "all" || id === "early" || id === "mid" || id === "senior" ||
    id === "not_stated" || id === "conflicting",
  );
  if (experience.length > 0) params.experience = [...new Set(experience)];

  const tracks = commaList(searchParams.tracks)
    .map(roleTrackFromId)
    .filter((track): track is RoleTypeFilter => track !== null);
  if (tracks.length > 0) params.roleTypes = [...new Set(tracks)];

  const portal = firstString(searchParams.portal);
  if (portal === "nontech") params.portal = "non-tech";

  const families = commaList(searchParams.fam)
    .map((id) => nonTechnicalFamilyById.get(id))
    .filter((family): family is NonTechnicalFamily => family !== undefined);
  if (families.length > 0) params.families = [...new Set(families)];
  if (params.families.length === 0) params.families = []; // explicit empty selection is valid

  const sort = firstString(searchParams.sort) as JobSortKey | undefined;
  if (sort && validSortKeys.has(sort)) params.sort = sort;

  const dir = firstString(searchParams.dir);
  if (dir === "asc" || dir === "desc") params.dir = dir;

  const limit = Number(firstString(searchParams.limit) ?? "");
  if (Number.isFinite(limit) && limit >= 1) {
    params.limit = Math.min(limit, MAX_PAGE_SIZE);
  }

  return params;
}

/** Serialize filters into a compact query string, omitting default values. */
export function serializeSearchParams(params: JobSearchParams): string {
  const url = new URLSearchParams();

  if (params.q) url.set("q", params.q);
  if (params.company) url.set("company", params.company);
  if (params.country !== defaultSearchParams.country) url.set("country", params.country);
  if (params.locations.length > 0) url.set("loc", params.locations.join(","));
  if (params.date !== defaultSearchParams.date) url.set("date", params.date);

  const defaultExp = new Set(defaultSearchParams.experience);
  const expDiffers =
    params.experience.length !== defaultSearchParams.experience.length ||
    params.experience.some((item) => !defaultExp.has(item));
  if (expDiffers) url.set("exp", params.experience.join(","));

  const defaultTracks = new Set(defaultSearchParams.roleTypes);
  const tracksDiffer =
    params.roleTypes.length !== defaultSearchParams.roleTypes.length ||
    params.roleTypes.some((track) => !defaultTracks.has(track));
  if (tracksDiffer) {
    url.set("tracks", params.roleTypes.map((track) => roleTrackIds[track]).join(","));
  }

  if (params.sort !== defaultSearchParams.sort) url.set("sort", params.sort);
  if (params.dir !== defaultSearchParams.dir) url.set("dir", params.dir);
  if (params.limit !== defaultSearchParams.limit) url.set("limit", String(params.limit));

  if (params.portal !== defaultSearchParams.portal) url.set("portal", "nontech");

  const defaultFamilies = new Set(defaultSearchParams.families);
  const familiesDiffer =
    params.families.length !== defaultSearchParams.families.length ||
    params.families.some((family) => !defaultFamilies.has(family));
  if (familiesDiffer) {
    url.set("fam", params.families.map((family) => nonTechnicalFamilyIds[family]).join(","));
  }

  const query = url.toString();
  return query ? `?${query}` : "";
}

const experienceOrder: Record<string, number> = {
  "not-stated": 0,
  "preferred-only": 1,
  explicit: 2,
  conflicting: 3,
};

function encodeCursor(offset: number) {
  return Buffer.from(`o:${offset}`, "utf8").toString("base64url");
}

export function nonTechnicalFamilyId(family: NonTechnicalFamily) {
  return nonTechnicalFamilyIds[family];
}

export { nonTechnicalFamilyOptions };

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const offset = Number(raw.startsWith("o:") ? raw.slice(2) : raw);
    return Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
  } catch {
    return 0;
  }
}

function matchesKeyword(entry: JobSearchEntry, query: string): boolean {
  if (!query) return true;
  return entry.searchText.includes(query);
}

function matchesRoleTypes(entry: JobSearchEntry, roleTypes: RoleTypeFilter[]): boolean {
  if (roleTypes.includes("all")) return true;
  return roleTypes.includes(entry.category as RoleTypeFilter);
}

function matchesPortal(
  entry: JobSearchEntry,
  portal: PortalId,
  roleTypes: RoleTypeFilter[],
  families: NonTechnicalFamily[],
) {
  if (portal === "non-tech") {
    return entry.nonTechFamily !== null && families.includes(entry.nonTechFamily);
  }
  return matchesRoleTypes(entry, roleTypes);
}

function compareEntries(
  left: JobSearchEntry,
  right: JobSearchEntry,
  sort: JobSortKey,
  direction: SortDirection,
) {
  const dir = direction === "asc" ? 1 : -1;

  if (sort === "postedAt" || sort === "updatedAt") {
    const leftValue = left.job[sort] ? Date.parse(left.job[sort]) : null;
    const rightValue = right.job[sort] ? Date.parse(right.job[sort]) : null;
    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return (leftValue - rightValue) * dir;
  }

  if (sort === "experience") {
    const score = (entry: JobSearchEntry) =>
      entry.seniorSignal
        ? 1000
        : (entry.requirement.effectiveMinYears ?? 99) * 10 +
          experienceOrder[entry.requirement.status];
    return (score(left) - score(right)) * dir;
  }

  const leftValue = sort === "title" ? left.job.title : left.job[sort];
  const rightValue = sort === "title" ? right.job.title : right.job[sort];
  return leftValue.localeCompare(rightValue) * dir;
}

/**
 * True when the query looks like a requisition reference ("10506349" or
 * "AMZ10506349"). An exact id is unambiguous intent, so matching jobs bypass
 * the curated portal/date/experience defaults that would otherwise hide them.
 */
const jobIdLookupPattern = /^(?:amz)?\d{5,}$/u;

function entryMatchesJobId(entry: JobSearchEntry, query: string) {
  const raw = String(entry.job.id).toLowerCase();
  return raw === query || `amz${raw}` === query;
}

function finalizeSearchResult(
  entries: JobSearchEntry[],
  params: JobSearchParams,
  cursorOffset: number,
): JobSearchResult {
  const sorted = entries.sort((left, right) => {
    const byKey = compareEntries(left, right, params.sort, params.dir);
    if (byKey !== 0) return byKey;
    return String(left.job.id).localeCompare(String(right.job.id));
  });

  const offset = Math.min(cursorOffset, sorted.length);
  const page = sorted.slice(offset, offset + params.limit);
  const companies = new Set(sorted.map((entry) => entry.job.company)).size;
  const nextOffset = offset + page.length;

  return {
    jobs: page.map(toJobListItem),
    nextCursor: nextOffset < sorted.length ? encodeCursor(nextOffset) : null,
    total: sorted.length,
    companies,
    offset,
  };
}

/**
 * Server-side search over the normalized snapshot. Runs on the server only;
 * returns slim items without any provider description text.
 */
export function searchJobs(
  entries: JobSearchEntry[],
  params: JobSearchParams,
  cursorOffset = 0,
  now = new Date(),
): JobSearchResult {
  const query = params.q.trim().toLowerCase();

  // Direct job-reference lookup (e.g. Amazon req "10506349"): the id is the
  // answer, so matching jobs surface regardless of the portal/date/experience
  // defaults. Without this, a "financial analyst" id search found nothing
  // because the id never appeared in the job's title or description.
  // Deduped by requisition: a reposted listing can briefly appear twice in a
  // snapshot, and one requisition must still yield exactly one result.
  if (jobIdLookupPattern.test(query)) {
    const seenIds = new Set<string>();
    const direct = entries.filter((entry) => {
      if (!entryMatchesJobId(entry, query)) {
        return false;
      }
      const key = `${entry.job.boardToken}:${entry.job.id}`;
      if (seenIds.has(key)) {
        return false;
      }
      seenIds.add(key);
      return true;
    });
    if (direct.length > 0) {
      return finalizeSearchResult(direct, params, cursorOffset);
    }
  }

  // Selecting any city (e.g. London) overrides the U.S.-only country default,
  // otherwise the country filter would silently exclude every European match.
  const effectiveCountry: CountryFilter = params.locations.length > 0 ? "all" : params.country;

  const matched = entries.filter((entry) => {
    const { job, requirement } = entry;
    return (
      matchesCompany(job.company, params.company) &&
      matchesCountry(job.location, effectiveCountry) &&
      matchesLocation(job.location, params.locations) &&
      matchesDate(job.postedAt, params.date, now) &&
      matchesKeyword(entry, query) &&
      matchesPortal(entry, params.portal, params.roleTypes, params.families) &&
      params.experience.some((filter) =>
        matchesExperienceFilter(requirement, job.title, filter),
      )
    );
  });

  return finalizeSearchResult(matched, params, cursorOffset);
}
