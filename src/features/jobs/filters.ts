import type { GreenhouseJob } from "./providers/greenhouse";
import {
  type ExperienceFilter,
  type RoleTypeFilter,
  classifyTechnicalRole,
  extractExperienceRequirement,
  hasSeniorOrManagerSignal,
  matchesExperienceFilter,
  matchesRoleTypeFilter,
} from "./display";

export type DateFilter =
  | "all"
  | "today"
  | "6h"
  | "12h"
  | "24h"
  | "48h"
  | "3d"
  | "week"
  | "2w";
export type CountryFilter = "us" | "all";
export type JobSortKey =
  | "title"
  | "company"
  | "experience"
  | "location"
  | "postedAt"
  | "updatedAt";
export type SortDirection = "asc" | "desc";

const experienceOrder = {
  "not-stated": 0,
  "preferred-only": 1,
  explicit: 2,
  conflicting: 3,
};

const hourMs = 60 * 60 * 1000;
const dateFilterDurations: Record<Exclude<DateFilter, "all" | "today">, number> = {
  "6h": 6 * hourMs,
  "12h": 12 * hourMs,
  "24h": 24 * hourMs,
  "48h": 48 * hourMs,
  "3d": 3 * 24 * hourMs,
  week: 7 * 24 * hourMs,
  "2w": 14 * 24 * hourMs,
};

export const remoteUsLocation = "remote-us";
export const seattleAreaLocation = "seattle-area";

export const locationFilters = [
  { label: "🏠 Remote (US)", value: remoteUsLocation },
  { label: "☕ Seattle area (WA)", value: seattleAreaLocation },
  { label: "🗽 New York", value: "New York" },
  { label: "🌉 San Francisco", value: "San Francisco" },
  { label: "🌴 Miami", value: "Miami" },
  { label: "🇬🇧 London", value: "London" },
  { label: "🇩🇪 Berlin", value: "Berlin" },
  { label: "🇫🇷 Paris", value: "Paris" },
  { label: "🇳🇱 Amsterdam", value: "Amsterdam" },
  { label: "🇨🇭 Zurich", value: "Zurich" },
  { label: "🇮🇪 Dublin", value: "Dublin" },
  { label: "🇪🇸 Madrid", value: "Madrid" },
  { label: "🇪🇸 Barcelona", value: "Barcelona" },
  { label: "🇸🇪 Stockholm", value: "Stockholm" },
  { label: "🇩🇪 Munich", value: "Munich" },
];

export function formatJobDate(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function isToday(value: string | null, now = new Date()) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function isWithinLastWeek(value: string | null, now = new Date()) {
  return isWithinLast(value, 7 * 24 * hourMs, now);
}

export function isWithinLast(value: string | null, maxAgeMs: number, now = new Date()) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  const elapsed = now.getTime() - timestamp;
  return elapsed >= 0 && elapsed <= maxAgeMs;
}

/**
 * Location presets match a region rather than a substring. "Seattle" as a
 * substring missed Redmond, Bellevue and every "Kirkland, WA" posting, and no
 * substring at all can express "remote, but open to the U.S.". Selecting
 * several chips ORs them, so Seattle area + Remote (US) is one search.
 */
const seattleAreaPattern =
  /\b(seattle|bellevue|redmond|kirkland|bothell|renton|everett|tacoma|issaquah|tukwila|lynnwood|sammamish|woodinville|olympia|spokane)\b|,\s*wa\b|\bwa,\s*us\b|\bwashington\b(?!\s*,?\s*d\.?\s*c\b)/u;
const remotePattern = /\b(remote|anywhere|distributed|work from home|wfh)\b/u;
const usMarkerPattern =
  /\b(us|usa|u\.s\.a?\.?|united states|north america|americas|us time ?zones?)\b/u;
const nonUsRemotePattern =
  /\b(emea|europe|eu|uk|united kingdom|england|india|canada|apac|asia|latam|brazil|germany|france|spain|poland|portugal|netherlands|ireland|israel|australia|mexico|argentina|colombia|chile|philippines|singapore|japan|international)\b/u;

export function isSeattleArea(location: string) {
  // Stripe writes its offices as codes: "SF, SEA, CHI, NYC".
  return seattleAreaPattern.test(location.toLowerCase()) || /\bSEA\b/u.test(location);
}

/**
 * Remote and open to someone in the U.S.: a U.S./Americas marker wins, a bare
 * "Remote" counts, and a remote role pinned only to another region does not.
 */
export function isUsRemote(location: string) {
  const normalized = location.toLowerCase();
  if (!remotePattern.test(normalized)) return false;
  if (usMarkerPattern.test(normalized)) return true;
  return !nonUsRemotePattern.test(normalized);
}

const locationPresets: Record<string, (location: string) => boolean> = {
  [remoteUsLocation]: isUsRemote,
  [seattleAreaLocation]: isSeattleArea,
};

export function matchesLocation(location: string, selectedLocations: string[]) {
  if (selectedLocations.length === 0) {
    return true;
  }

  const normalized = location.toLowerCase();
  return selectedLocations.some((selected) => {
    const preset = locationPresets[selected];
    return preset ? preset(location) : normalized.includes(selected.toLowerCase());
  });
}

// "Bellevue, WA" or "Austin, TX": the state code is the only U.S. marker many
// postings carry. Matched case-sensitively so "in" or "or" never count.
const usStateCodePattern =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/u;

export function matchesCountry(location: string, countryFilter: CountryFilter) {
  if (countryFilter === "all") {
    return true;
  }

  const normalized = location.toLowerCase();
  return (
    /\b(us|usa|u\.s\.|u\.s\.a\.|united states|new york|nyc|seattle|san francisco|sf|miami|california|washington|florida)\b/u.test(
      normalized,
    ) ||
    usStateCodePattern.test(location) ||
    isSeattleArea(location) ||
    isUsRemote(location)
  );
}

export function matchesDate(
  postedAt: string | null,
  dateFilter: DateFilter,
  now = new Date(),
) {
  if (dateFilter === "today") {
    return isToday(postedAt, now);
  }

  if (dateFilter === "all") {
    return true;
  }

  return isWithinLast(postedAt, dateFilterDurations[dateFilter], now);
}

export function matchesCompany(company: string, selectedCompany: string | null) {
  if (!selectedCompany) {
    return true;
  }

  return company === selectedCompany;
}

export function sortJobs(
  jobs: GreenhouseJob[],
  sortKey: JobSortKey,
  sortDirection: SortDirection,
) {
  const direction = sortDirection === "asc" ? 1 : -1;

  return [...jobs].sort((left, right) => {
    if (sortKey === "postedAt" || sortKey === "updatedAt") {
      const leftValue = left[sortKey] ? Date.parse(left[sortKey]) : null;
      const rightValue = right[sortKey] ? Date.parse(right[sortKey]) : null;

      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      return (leftValue - rightValue) * direction;
    }

    if (sortKey === "experience") {
      const leftRequirement = extractExperienceRequirement(`${left.title}. ${left.contentText}`);
      const rightRequirement = extractExperienceRequirement(`${right.title}. ${right.contentText}`);
      const leftValue =
        hasSeniorOrManagerSignal(left.title)
          ? 1000
          : (leftRequirement.effectiveMinYears ?? 99) * 10 + experienceOrder[leftRequirement.status];
      const rightValue =
        hasSeniorOrManagerSignal(right.title)
          ? 1000
          : (rightRequirement.effectiveMinYears ?? 99) * 10 + experienceOrder[rightRequirement.status];
      return (leftValue - rightValue) * direction;
    }

    const leftValue = sortKey === "title" ? left.title : left[sortKey];
    const rightValue = sortKey === "title" ? right.title : right[sortKey];
    return leftValue.localeCompare(rightValue) * direction;
  });
}

export function filterJobs(
  jobs: GreenhouseJob[],
  selectedLocations: string[],
  dateFilter: DateFilter,
  experienceFilter: ExperienceFilter | ExperienceFilter[] = "all",
  roleTypeFilters: RoleTypeFilter[] = ["all"],
  countryFilter: CountryFilter = "us",
  selectedCompany: string | null = null,
  now = new Date(),
) {
  return jobs.filter((job) => {
    const requirement = extractExperienceRequirement(`${job.title}. ${job.contentText}`);
    const classification = classifyTechnicalRole(job.title);
    const roleTypeMatches = roleTypeFilters.includes("all")
      ? true
      : roleTypeFilters.includes(classification.matchedCategory);

    return (
      matchesCompany(job.company, selectedCompany) &&
      matchesCountry(job.location, countryFilter) &&
      matchesLocation(job.location, selectedLocations) &&
      matchesDate(job.postedAt, dateFilter, now) &&
      roleTypeMatches &&
      matchesRoleTypeFilter(job.title, classification.matchedCategory) &&
      (Array.isArray(experienceFilter)
        ? experienceFilter.some((filter) => matchesExperienceFilter(requirement, job.title, filter))
        : matchesExperienceFilter(requirement, job.title, experienceFilter))
    );
  });
}
