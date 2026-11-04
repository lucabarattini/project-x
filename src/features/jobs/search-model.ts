import type { GreenhouseJob } from "./providers/greenhouse";
import {
  classifyNonTechnicalRole,
  classifyTechnicalRole,
  experienceBadge,
  extractExperienceRequirement,
  hasSeniorOrManagerSignal,
  nonTechnicalFamilyOptions,
  type ExperienceRequirement,
  type NonTechnicalFamily,
} from "./display";

/**
 * The job fields the client and the search engine need. Full provider
 * descriptions are never written to the board.
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
 * One job as a result row in the dashboard.
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
    category === "Needs Review"
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
    // The requisition id and its provider-prefixed form (e.g. Amazon's
    // "AMZ10506349") are searchable so users can look a job up by the exact
    // id they saw on the company's ATS.
    searchText: [
      job.title,
      job.company,
      job.location,
      category,
      String(job.id),
      `amz${job.id}`,
      job.contentText,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

/**
 * One snapshot entry as the browser's search index carries it: a tuple
 * instead of an object (keys repeated 20k times were a third of the bytes),
 * and only the requirement fields the filters and the badge read.
 */
export type IndexRow = [
  id: number | string,
  title: string,
  company: string,
  boardToken: string,
  location: string,
  absoluteUrl: string,
  postedAt: string | null,
  updatedAt: string | null,
  category: string,
  nonTechFamily: NonTechnicalFamily | null,
  status: ExperienceRequirement["status"],
  minYears: number | null,
  maxYears: number | null,
];

export function toIndexRow({ job, category, nonTechFamily, requirement }: JobSearchEntry): IndexRow {
  return [
    job.id, job.title, job.company, job.boardToken, job.location, job.absoluteUrl,
    job.postedAt, job.updatedAt, category, nonTechFamily,
    requirement.status, requirement.effectiveMinYears, requirement.effectiveMaxYears,
  ];
}

/** The id the judge's labels are stored under. */
export function rowKey(job: { boardToken: string; id: number | string }) {
  return `${job.boardToken}:${job.id}`;
}

/**
 * Rebuilds a search entry from an index row; keyword text covers title, company,
 * location and id only. A judge label overrides what the title rules decided.
 */
export function fromIndexRow(row: IndexRow, label?: string): JobSearchEntry {
  const [id, title, company, boardToken, location, absoluteUrl, postedAt, updatedAt, ruleCategory, ruleFamily, status, minYears, maxYears] = row;
  const family = nonTechnicalFamilyOptions.find((option) => option === label) ?? null;
  const category = family ? "Non-Technical" : label || ruleCategory;
  return {
    job: { id, title, company, boardToken, location, absoluteUrl, postedAt, updatedAt },
    category,
    nonTechFamily: label ? family : ruleFamily,
    requirement: { status, effectiveMinYears: minYears, effectiveMaxYears: maxYears, evidence: [] },
    seniorSignal: hasSeniorOrManagerSignal(title),
    searchText: [title, company, location, category, String(id), `amz${id}`].join(" ").toLowerCase(),
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
