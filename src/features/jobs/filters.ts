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

export const locationFilters = [
  { label: "🗽 New York", value: "New York" },
  { label: "☕ Seattle", value: "Seattle" },
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

export function matchesLocation(location: string, selectedLocations: string[]) {
  if (selectedLocations.length === 0) {
    return true;
  }

  const normalized = location.toLowerCase();
  return selectedLocations.some((selected) =>
    normalized.includes(selected.toLowerCase()),
  );
}

export function matchesCountry(location: string, countryFilter: CountryFilter) {
  if (countryFilter === "all") {
    return true;
  }

  const normalized = location.toLowerCase();
  return /\b(us|usa|u\.s\.|u\.s\.a\.|united states|new york|nyc|seattle|san francisco|sf|miami|california|washington|florida)\b/u.test(
    normalized,
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
