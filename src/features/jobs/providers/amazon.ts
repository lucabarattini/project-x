import boards from "../../../../data/amazon-boards.json";
import type { GreenhouseBoard, GreenhouseJob } from "./greenhouse";

type AmazonApiJob = {
  id?: string;
  id_icims?: string;
  title?: string;
  location?: string;
  normalized_location?: string;
  description?: string;
  description_short?: string;
  basic_qualifications?: string;
  preferred_qualifications?: string;
  job_path?: string;
  posted_date?: string;
  updated_time?: string;
  job_category?: string;
  job_family?: string;
  business_category?: string;
  job_schedule_type?: string;
  is_intern?: boolean | null;
  is_manager?: boolean | null;
  university_job?: boolean | null;
  locations?: string[];
};

type AmazonApiResponse = {
  hits?: number;
  jobs?: AmazonApiJob[];
};

type FetchAmazonJobsOptions = {
  maxJobs?: number;
  pageSize?: number;
  /**
   * Keyword passed to Amazon's own ATS `base_query`. Amazon's search.json
   * behaves exactly like the careers-site search box, so role-specific
   * searches (e.g. "financial analyst") return the same hits the ATS shows.
   * Empty by default, which keeps the provider's recency-feed behavior.
   */
  query?: string;
  /**
   * Location keyword passed to `loc_query`. Note: Amazon's search.json
   * currently ignores `loc_query` (verified 2026-08); location filtering is
   * applied to `normalized_location` after the fetch instead.
   */
  locQuery?: string;
};

export const amazonBoards = boards as GreenhouseBoard[];

export function parseAmazonPostedDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(`${value} 12:00:00 GMT`);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

export function parseAmazonUpdatedTime(value: string | undefined, now = new Date()) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const relative = normalized.match(
    /(?:about\s+)?(\d+)\s+(minute|hour|day|week)s?\b/u,
  );

  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    }[relative[2]];

    if (unitMs) {
      return new Date(now.getTime() - amount * unitMs).toISOString();
    }
  }

  if (/less than (?:an?|one) hour/u.test(normalized)) {
    return now.toISOString();
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<li[^>]*>/giu, " - ")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(p|div|section|h2|h3|ul|ol)>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function amazonJobUrl(jobPath: string | undefined) {
  if (!jobPath || !jobPath.startsWith("/") || jobPath.startsWith("//")) {
    return "https://www.amazon.jobs/en/search?country=USA";
  }

  return `https://www.amazon.jobs${jobPath}`;
}

function isAmazonRemote(job: AmazonApiJob) {
  const locationText = [
    job.location,
    job.normalized_location,
    ...(job.locations ?? []),
  ].join(" ").toLowerCase();

  return locationText.includes("remote") || locationText.includes("\"type\":\"remote\"");
}

function isAmazonStudentProgram(job: AmazonApiJob) {
  const text = [
    job.title,
    job.job_category,
    job.business_category,
    job.description_short,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return job.is_intern === true || job.university_job === true || /\b(student|internship|intern|graduate|new grad)\b/u.test(text);
}

function isAmazonFulfillmentCenter(job: AmazonApiJob) {
  const text = [
    job.job_category,
    job.business_category,
    job.title,
    job.description_short,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(fulfillment|warehouse|sort center|delivery station|operations management)\b/u.test(text);
}

function isAmazonPeopleManager(job: AmazonApiJob) {
  if (job.is_manager === true) {
    return true;
  }

  const title = (job.title ?? "").toLowerCase();

  if (/\b(program|product|project|account|partner|vendor|risk|marketing|finance|category|portfolio|community|content|campaign|policy|event|technical program)\s+manager\b/u.test(title)) {
    return false;
  }

  return /\b(area manager|operations manager|data center manager|engineering manager|software development manager|people manager|team manager|manager[, -]|senior manager|sr\.?\s+manager|director|head of|site leader)\b/u.test(title);
}

function matchesAmazonRequestedScope(job: AmazonApiJob) {
  if (isAmazonPeopleManager(job) || isAmazonFulfillmentCenter(job)) {
    return false;
  }

  const category = (job.job_category ?? "").toLowerCase();
  const businessCategory = (job.business_category ?? "").toLowerCase();
  const isCorporate =
    category.includes("corporate") ||
    businessCategory.includes("corporate") ||
    !isAmazonFulfillmentCenter(job);

  return isCorporate || isAmazonStudentProgram(job) || isAmazonRemote(job);
}

async function fetchAmazonPage(
  board: GreenhouseBoard,
  limit: number,
  offset: number,
  query = "",
  locQuery = "",
) {
  const params = new URLSearchParams({
    base_query: query,
    country: "USA",
    normalized_country_code: "USA",
    loc_query: locQuery,
    offset: String(offset),
    result_limit: String(limit),
    sort: "recent",
  });
  const url = `${board.apiUrl}&${params.toString()}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0",
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`${board.company} returned ${response.status}`);
  }

  return (await response.json()) as AmazonApiResponse;
}

export async function fetchLatestAmazonJobs(options: FetchAmazonJobsOptions = {}) {
  const { maxJobs = 300, pageSize = 100, query = "", locQuery = "" } = options;
  const board = amazonBoards[0];
  const results: GreenhouseJob[] = [];
  let totalHits = maxJobs;

  for (let offset = 0; offset < Math.min(maxJobs, totalHits); offset += pageSize) {
    try {
      const data = await fetchAmazonPage(board, pageSize, offset, query, locQuery);
      const jobs = data.jobs ?? [];
      totalHits = data.hits ?? totalHits;

      for (const job of jobs) {
        if (!matchesAmazonRequestedScope(job)) {
          continue;
        }

        const id = job.id_icims ?? job.id ?? job.job_path;
        if (!id) {
          continue;
        }

        const contentText = [
          job.job_category,
          job.job_family,
          job.business_category,
          job.job_schedule_type,
          job.description_short,
          job.description,
          job.basic_qualifications,
          job.preferred_qualifications,
        ]
          .filter(Boolean)
          .map((value) => stripHtml(value))
          .join(" ");

        results.push({
          id,
          title: job.title ?? "Untitled",
          company: "Amazon",
          boardToken: board.token,
          location: job.normalized_location ?? job.location ?? "United States",
          absoluteUrl: amazonJobUrl(job.job_path),
          contentText,
          postedAt: parseAmazonPostedDate(job.posted_date),
          updatedAt: parseAmazonUpdatedTime(job.updated_time),
        });
      }

      if (jobs.length < pageSize) {
        break;
      }
    } catch {
      break;
    }
  }

  return results
    .sort((a, b) => {
      const left = a.postedAt ? Date.parse(a.postedAt) : 0;
      const right = b.postedAt ? Date.parse(b.postedAt) : 0;
      return right - left;
    })
    .slice(0, maxJobs);
}
