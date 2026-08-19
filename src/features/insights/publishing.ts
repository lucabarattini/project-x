import type { GreenhouseJob } from "@/features/jobs/providers/greenhouse";

export const publishingInsightPeriods = [7, 14, 30] as const;
export type PublishingInsightPeriod = (typeof publishingInsightPeriods)[number];

export const publishingSpotlightCompanies = [
  "Google",
  "Amazon",
  "OpenAI",
  "Anthropic",
  "Databricks",
  "Stripe",
] as const;

export type PublishingInsightDay = {
  date: string;
  counts: Record<string, number>;
  total: number;
};

export type PublishingInsightCompany = {
  company: string;
  total: number;
};

export type PublishingInsightData = {
  days: PublishingInsightDay[];
  companies: PublishingInsightCompany[];
  spotlightTotal: number;
  allCompaniesTotal: number;
  busiestDay: PublishingInsightDay | null;
};

export type PublishingInsightsByPeriod = Record<PublishingInsightPeriod, PublishingInsightData>;

const easternDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/New_York",
  year: "numeric",
});

export function easternDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;

  const parts = easternDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function periodDateKeys(asOf: string, dayCount: PublishingInsightPeriod) {
  const endDateKey = easternDateKey(asOf);
  if (!endDateKey) return [];

  const [year, month, day] = endDateKey.split("-").map(Number);
  const endDateUtc = Date.UTC(year, month - 1, day);

  return Array.from({ length: dayCount }, (_, index) => {
    const daysBeforeEnd = dayCount - index - 1;
    return new Date(endDateUtc - daysBeforeEnd * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  });
}

export function buildPublishingInsights(
  jobs: Array<Pick<GreenhouseJob, "company" | "postedAt">>,
  asOf: string,
  dayCount: PublishingInsightPeriod,
): PublishingInsightData {
  const dateKeys = periodDateKeys(asOf, dayCount);
  const dateKeySet = new Set(dateKeys);
  const countsByDate = new Map<string, Map<string, number>>();
  let allCompaniesTotal = 0;

  for (const job of jobs) {
    if (!job.postedAt) continue;
    const dateKey = easternDateKey(job.postedAt);
    if (!dateKey || !dateKeySet.has(dateKey)) continue;

    allCompaniesTotal += 1;
    const companyCounts = countsByDate.get(dateKey) ?? new Map<string, number>();
    companyCounts.set(job.company, (companyCounts.get(job.company) ?? 0) + 1);
    countsByDate.set(dateKey, companyCounts);
  }

  const companies = publishingSpotlightCompanies
    .map((company) => ({
      company,
      total: dateKeys.reduce(
        (sum, dateKey) => sum + (countsByDate.get(dateKey)?.get(company) ?? 0),
        0,
      ),
    }))
    .sort((left, right) => right.total - left.total || left.company.localeCompare(right.company));

  const days = dateKeys.map((date) => {
    const counts = Object.fromEntries(
      publishingSpotlightCompanies.map((company) => [
        company,
        countsByDate.get(date)?.get(company) ?? 0,
      ]),
    );
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return { date, counts, total };
  });

  const spotlightTotal = companies.reduce((sum, company) => sum + company.total, 0);
  const busiestDay = spotlightTotal === 0
    ? null
    : days.reduce<PublishingInsightDay | null>(
        (busiest, day) => (!busiest || day.total > busiest.total ? day : busiest),
        null,
      );

  return {
    days,
    companies,
    spotlightTotal,
    allCompaniesTotal,
    busiestDay,
  };
}

export function buildPublishingInsightsByPeriod(
  jobs: Array<Pick<GreenhouseJob, "company" | "postedAt">>,
  asOf: string,
): PublishingInsightsByPeriod {
  return Object.fromEntries(
    publishingInsightPeriods.map((period) => [
      period,
      buildPublishingInsights(jobs, asOf, period),
    ]),
  ) as PublishingInsightsByPeriod;
}
