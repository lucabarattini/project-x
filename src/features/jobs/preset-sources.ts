// Server-only: resolves a saved search against its careers site (see presets.ts).
import { detailConcurrency, mapWithinDeadline, pageConcurrency } from "./providers/concurrency";
import { parseAppleHydrationData, parseAppleTotalRecords } from "./providers/apple";
import type { GreenhouseJob } from "./providers/greenhouse";
import { after } from "next/server";
import type { SearchPreset } from "./presets";

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

/**
 * Reads every page of a jobs.apple.com search (20 a page). Store-floor titles
 * are dropped by the same parser the Apple provider uses.
 */
const appleHeaders = {
  accept: "text/html",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

/**
 * Apple's search rows carry no requirements; its detail page does, as
 * minimum/preferred qualifications. A posting's requirements never change, so
 * each is read once per instance and kept here, never in the Next.js fetch
 * cache (350 pages of ~190 kB).
 */
const appleQualifications = new Map<string, string | null>();
let appleQualificationFill: Promise<unknown> | null = null;

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

async function resolveAppleSearch(url: string): Promise<GreenhouseJob[]> {
  const startedAt = Date.now();
  const readPage = async (page: number) => {
    const response = await fetch(`${url}&page=${page}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(12_000),
      headers: appleHeaders,
    });
    return response.ok ? response.text() : "";
  };

  const first = await readPage(1);
  const pageCount = Math.ceil(parseAppleTotalRecords(first) / 20);
  const rest = await mapWithinDeadline(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2),
    pageConcurrency,
    startedAt,
    25_000,
    async (page) => parseAppleHydrationData(await readPage(page)),
  );
  const jobs = [...parseAppleHydrationData(first), ...rest.flat()];

  // Reading 350 detail pages inside the click took 30 s and more, so the
  // response goes out with what is known, and the missing details are read
  // after it; a row reads "Not Stated" until then.
  const missing = jobs.filter((job) => !appleQualifications.has(job.id));
  if (missing.length > 0 && !appleQualificationFill) {
    const fill = mapWithinDeadline(missing, detailConcurrency, Date.now(), 90_000, async (job) => {
      appleQualifications.set(job.id, await readAppleQualifications(job.absoluteUrl));
    }).finally(() => {
      appleQualificationFill = null;
    });
    appleQualificationFill = fill;
    try {
      after(() => fill);
    } catch {
      // Outside a request there is no response to wait for.
    }
  }

  return jobs.map((job) => ({
    ...job,
    contentText: appleQualifications.get(job.id) ?? job.contentText,
    company: "Apple",
    boardToken: "apple-jobs",
    updatedAt: null,
  }));
}

/** What a preset's search returns on its own site: posting ids, or whole rows. */
export async function resolvePreset(
  preset: SearchPreset,
): Promise<{ ids: Set<string> } | { jobs: GreenhouseJob[] }> {
  return preset.site === "apple"
    ? { jobs: await resolveAppleSearch(preset.url) }
    : { ids: await resolveStripeSearch(preset.url) };
}
