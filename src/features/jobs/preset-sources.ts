// Server-only: resolves a saved search against its careers site (see presets.ts).
import { detailConcurrency, mapWithinDeadline, pageConcurrency } from "./providers/concurrency";
import { parseAppleHydrationData, parseAppleTotalRecords } from "./providers/apple";
import { compactExperienceEvidence } from "./display";
import { searchPresets } from "./presets";
import { buildSearchEntry, type JobSearchEntry } from "./search-model";

type StripeIndex = {
  filters: {
    teams: Array<{ name: string; parentTeamIndex?: number }>;
    locations: Array<{ name: string; parentLocationIndex?: number }>;
  };
  listings: Array<{
    greenhouseId: number;
    teamIndices: number[];
    locationIndices: number[];
    employmentType: string;
  }>;
};

/**
 * Applies a stripe.com/careers/search URL to the index the page embeds in
 * __NEXT_DATA__. A team matches through its parents ("Controllership" sits
 * under "Finance"); a location is the last "--" segment ("…--Seattle").
 */
async function resolveStripeSearch(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
  });
  if (!response.ok) throw new Error(`Stripe careers returned ${response.status}`);
  const html = await response.text();
  const data = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/u)?.[1];
  if (!data) throw new Error("Stripe careers page carried no job index");
  const index = JSON.parse(data).props.pageProps.jobIndexData as StripeIndex;

  const query = new URL(url).searchParams;
  const teams = new Set(query.getAll("teams"));
  const locations = new Set(query.getAll("locations").map((value) => value.split("--").at(-1)));
  const employmentTypes = new Set(query.getAll("employment_types"));

  const inNamedSet = (
    names: Set<string | undefined>,
    entries: Array<{ name: string; parentTeamIndex?: number; parentLocationIndex?: number }>,
    start: number,
  ) => {
    for (let at: number | undefined = start; at !== undefined; at = entries[at].parentTeamIndex ?? entries[at].parentLocationIndex) {
      if (names.has(entries[at].name)) return true;
    }
    return false;
  };

  return new Set(
    index.listings
      .filter((listing) =>
        (teams.size === 0 || listing.teamIndices.some((team) => inNamedSet(teams, index.filters.teams, team))) &&
        (locations.size === 0 || listing.locationIndices.some((location) => inNamedSet(locations, index.filters.locations, location))) &&
        (employmentTypes.size === 0 || employmentTypes.has(listing.employmentType)),
      )
      .map((listing) => String(listing.greenhouseId)),
  );
}

const appleHeaders = {
  accept: "text/html",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

/** Minimum/preferred qualifications from a posting's detail page; its search row has none. */
async function readAppleQualifications(absoluteUrl: string) {
  try {
    const response = await fetch(absoluteUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: appleHeaders,
    });
    if (!response.ok) return null;
    const literal = (await response.text()).match(
      /window\.__staticRouterHydrationData\s*=\s*JSON\.parse\(("[\s\S]*?[^\\]")\);/u,
    )?.[1];
    if (!literal) return null;
    const loaders = Object.values(JSON.parse(JSON.parse(literal) as string).loaderData ?? {}) as Array<{
      jobsData?: { minimumQualifications?: string; preferredQualifications?: string };
    }>;
    const job = loaders.find((loader) => loader?.jobsData)?.jobsData;
    if (!job?.minimumQualifications) return null;
    return `Minimum Qualifications: ${job.minimumQualifications}\nPreferred Qualifications: ${job.preferredQualifications ?? ""}`;
  } catch {
    return null;
  }
}

/**
 * Every page of a jobs.apple.com search (20 a page); store-floor titles are
 * dropped by the parser the Apple provider uses. From a datacenter IP Apple
 * refuses some pages and answers others with rows already seen, so a page
 * that adds no new posting counts as failed, and the read as incomplete.
 */
async function readAppleSearch(url: string, startedAt: number) {
  let failedPages = 0;
  const readPage = async (page: number) => {
    const response = await fetch(`${url}&page=${page}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: appleHeaders,
    }).catch(() => null);
    if (!response?.ok) {
      failedPages += 1;
      return "";
    }
    return response.text();
  };

  const first = await readPage(1);
  const pageCount = Math.ceil(parseAppleTotalRecords(first) / 20);
  const pages = [
    parseAppleHydrationData(first),
    ...(await mapWithinDeadline(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2),
      pageConcurrency,
      startedAt,
      12_000,
      async (page) => parseAppleHydrationData(await readPage(page)),
    )),
  ];

  const jobs = new Map<string, ReturnType<typeof parseAppleHydrationData>[number]>();
  for (const page of pages) {
    const before = jobs.size;
    for (const job of page) jobs.set(job.id, job);
    if (page.length > 0 && jobs.size === before) failedPages += 1;
  }
  return {
    jobs: [...jobs.values()],
    complete: pageCount > 0 && failedPages === 0 && pages.length === pageCount,
  };
}

async function resolveApplePreset(
  url: string,
  previous: JobSearchEntry[] | undefined,
): Promise<JobSearchEntry[]> {
  const startedAt = Date.now();
  const { jobs, complete } = await readAppleSearch(url, startedAt);

  // Requirements never change, so a posting already read keeps its entry and
  // only new ones (or ones whose requirements never came back) cost a request.
  const known = new Map(
    (previous ?? [])
      .filter((entry) => entry.requirement.status !== "not-stated")
      .map((entry) => [String(entry.job.id), entry]),
  );
  const fresh = jobs.filter((job) => !known.has(job.id));
  const qualifications = new Map<string, string>();
  await mapWithinDeadline(fresh, detailConcurrency, startedAt, 20_000, async (job) => {
    const text = await readAppleQualifications(job.absoluteUrl);
    if (text) qualifications.set(job.id, text);
  });

  const entries = jobs.map((job) =>
    known.get(job.id) ??
    buildSearchEntry({
      ...job,
      company: "Apple",
      boardToken: "apple-jobs",
      updatedAt: null,
      contentText: compactExperienceEvidence(qualifications.get(job.id) ?? job.contentText),
    }),
  );
  if (complete) return entries;

  // A partial read keeps the postings the last read had, rather than letting
  // a refused page make roles vanish until the next build.
  const ids = new Set(entries.map((entry) => String(entry.job.id)));
  return [...entries, ...(previous ?? []).filter((entry) => !ids.has(String(entry.job.id)))];
}

/**
 * Resolves every saved search for a new snapshot, so a click is a lookup and
 * every instance answers the same. Runs inside the background build; a preset
 * whose site cannot be read keeps what the previous snapshot had.
 */
export async function resolvePresets(
  entries: JobSearchEntry[],
  previous: Record<string, JobSearchEntry[]> | undefined,
): Promise<Record<string, JobSearchEntry[]>> {
  const resolved: Record<string, JobSearchEntry[]> = {};
  await Promise.all(searchPresets.map(async (preset) => {
    try {
      if (preset.site === "apple") {
        resolved[preset.id] = await resolveApplePreset(preset.url, previous?.[preset.id]);
      } else {
        const ids = await resolveStripeSearch(preset.url);
        resolved[preset.id] = entries.filter(
          (entry) => entry.job.company === preset.company && ids.has(String(entry.job.id)),
        );
      }
    } catch {
      resolved[preset.id] = previous?.[preset.id] ?? [];
    }
  }));
  return resolved;
}
