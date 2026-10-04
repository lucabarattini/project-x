/**
 * Saved searches: a careers-site search URL, kept exactly as built on that
 * site. Stripe's and Apple's own boards never say when a role was posted;
 * resolving the same search here shows those roles with their posting date
 * and experience line. The site answers which postings match, the snapshot
 * supplies everything else, matched on the posting id both share.
 */
export type SearchPreset = {
  id: string;
  label: string;
  company: string;
  url: string;
};

export const searchPresets: SearchPreset[] = [
  {
    id: "stripe-gemma",
    label: "Stripe · Seattle (Gemma)",
    company: "Stripe",
    url: "https://stripe.com/careers/search?teams=Administrative&teams=Corporate+Development&teams=Finance&teams=Global+Partnerships&teams=Go-to-Market&teams=People&teams=Products&teams=Risk+%26+Financial+Crimes&locations=North+America--United+States--Seattle&employment_types=Full+time",
  },
];

export function findPreset(id: string | null) {
  return searchPresets.find((preset) => preset.id === id) ?? null;
}

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

/** The posting ids a preset's search returns on its own site. */
export function resolvePreset(preset: SearchPreset): Promise<Set<string>> {
  return resolveStripeSearch(preset.url);
}
