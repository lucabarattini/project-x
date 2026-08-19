import type { GreenhouseJob } from "./providers/greenhouse";
import {
  classifyNonTechnicalRole,
  classifyTechnicalRole,
  experienceBadge,
  extractExperienceRequirement,
  hasSeniorOrManagerSignal,
  type ExperienceRequirement,
  type NonTechnicalFamily,
} from "./display";

/**
 * The job fields the client and the search engine need. Full provider
 * descriptions stay on the server and are never serialized into pages,
 * API responses, or the data cache.
 */
export type SearchJob = {
  id: number | string;
  title: string;
  company: string;
  boardToken: string;
  location: string;
  absoluteUrl: string;
  postedAt: string | null;
  updatedAt: string | null;
};

/**
 * The minimal per-job shape sent to the browser. Full provider descriptions
 * stay on the server; the client never receives contentText.
 */
export type JobListItem = SearchJob & {
  category: string;
  nonTechFamily: NonTechnicalFamily | null;
  badgeLabel: string;
  badgeClass: string;
};

export type JobSearchEntry = {
  job: SearchJob;
  category: string;
  nonTechFamily: NonTechnicalFamily | null;
  requirement: ExperienceRequirement;
  seniorSignal: boolean;
  searchText: string;
};

export function buildSearchEntry(job: GreenhouseJob): JobSearchEntry {
  const requirement = extractExperienceRequirement(`${job.title}. ${job.contentText}`);
  const category = classifyTechnicalRole(job.title).matchedCategory;
  const nonTechFamily =
    category === "Non-Technical" ||
    category === "Operations & Support" ||
    category === "Needs Review" ||
    category === "Analytics & Business Intelligence"
      ? classifyNonTechnicalRole(job.title)
      : null;
  return {
    job: {
      id: job.id,
      title: job.title,
      company: job.company,
      boardToken: job.boardToken,
      location: job.location,
      absoluteUrl: job.absoluteUrl,
      postedAt: job.postedAt,
      updatedAt: job.updatedAt,
    },
    category,
    nonTechFamily,
    requirement,
    seniorSignal: hasSeniorOrManagerSignal(job.title),
    searchText: [job.title, job.company, job.location, category, job.contentText]
      .join(" ")
      .toLowerCase(),
  };
}

export function toJobListItem(entry: JobSearchEntry): JobListItem {
  const { job, category, nonTechFamily, requirement } = entry;
  const badge = experienceBadge(requirement, job.title);
  return {
    ...job,
    category,
    nonTechFamily,
    badgeLabel: badge.label,
    badgeClass: badge.className,
  };
}

export type { ExperienceRequirement };
