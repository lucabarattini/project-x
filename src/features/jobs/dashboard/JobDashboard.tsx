"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CompanyLogo } from "@/features/companies/CompanyLogo";
import {
  dateFilterOptions,
  experienceFilterOptions,
  roleTrackIcons,
  roleTracks,
} from "./config";
import {
  type JobSearchParams,
  type JobSearchResult,
  defaultSearchParams,
  nonTechnicalFamilyOptions,
  serializeSearchParams,
} from "../search";
import { locationFilters, type DateFilter, type JobSortKey } from "../filters";
import {
  nonTechnicalFamilies,
  type ExperienceFilter,
  type NonTechnicalFamily,
  type RoleTypeFilter,
} from "../display";
import type { JobListItem } from "../search-model";
import type { GreenhouseBoard } from "../providers/greenhouse";
import type { ProviderDiagnostic } from "../service";

type Props = {
  boards: GreenhouseBoard[];
  companyCounts: Array<{ company: string; count: number }>;
  /** Totals for the next wider date windows, used to widen a near-empty "today" default. */
  defaultDateCounts?: Array<{ date: DateFilter; total: number }>;
  initial: JobSearchResult;
  initialParams: JobSearchParams;
  snapshotFetchedAt: string;
  diagnostics: ProviderDiagnostic[];
};

const experienceLabels: Record<string, string> = {
  early: "1–3 Years",
  mid: "4–5 Years",
  senior: "6+ Years",
  not_stated: "Not Stated",
  conflicting: "Conflicting",
  all: "All Experience",
};

function formatJobDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatExactDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRelativeDate(value: string | null, now = new Date()) {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "—";
  const elapsed = now.getTime() - timestamp;
  if (elapsed < 0) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatExactDate(value) ?? "—";
}



const nonTechnicalFamilyIcons: Record<NonTechnicalFamily, IconName> = {
  "Sales & Partnerships": "trending-up",
  "Marketing & Communications": "sparkle",
  "Design & Creative": "layers",
  "Customer Success & Support": "users",
  "Product & Program": "briefcase",
  "Finance & Accounting": "chart-bar",
  "Operations & Supply Chain": "wrench",
  "Analytics & Strategy": "layers",
  Other: "search",
};

function FilterHeading({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
      <Icon name={icon} className="h-4 w-4 text-sky-700 dark:text-sky-400" />
      <span>{children}</span>
    </div>
  );
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card overflow-hidden ${className}`}>{children}</div>;
}

export function JobDashboard({
  boards,
  companyCounts,
  defaultDateCounts = [],
  initial,
  initialParams,
  snapshotFetchedAt,
  diagnostics,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [params, setParams] = useState<JobSearchParams>(initialParams);
  const [qDraft, setQDraft] = useState(initialParams.q);
  const [results, setResults] = useState<JobListItem[]>(initial.jobs);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [total, setTotal] = useState(initial.total);
  const [companiesInResults, setCompaniesInResults] = useState(initial.companies);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date>(() => new Date());
  const [widenedDefault, setWidenedDefault] = useState<{ date: DateFilter; todayCount: number } | null>(null);

  // Keep local state in sync with the server-rendered result page.
  // Deferred to the next frame so a navigation never cascades renders
  // synchronously inside the effect.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setParams(initialParams);
      setQDraft(initialParams.q);
      setResults(initial.jobs);
      setNextCursor(initial.nextCursor);
      setTotal(initial.total);
      setCompaniesInResults(initial.companies);
    });
    return () => cancelAnimationFrame(frame);
  }, [initial, initialParams]);

  // Refreshes the current URL search state every five minutes. The server
  // snapshot itself only expires through the 300-second data cache.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setLastCheckedAt(new Date());
      router.refresh();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [router]);

  // Debounced keyword search, pushed into the URL so it stays shareable.
  useEffect(() => {
    if (qDraft === params.q) return;
    const id = window.setTimeout(() => {
      const next = { ...params, q: qDraft.trim().slice(0, 200) };
      setParams(next);
      startTransition(() => {
        router.replace(`/${serializeSearchParams(next)}`);
      });
    }, 350);
    return () => window.clearTimeout(id);
  }, [qDraft, params, router, startTransition]);

  const updateParams = useCallback(
    (patch: Partial<JobSearchParams>) => {
      const next = { ...params, ...patch };
      setParams(next);
      startTransition(() => {
        router.replace(`/${serializeSearchParams(next)}`);
      });
    },
    [params, router, startTransition],
  );

  const resetFilters = useCallback(() => {
    setQDraft("");
    const next = { ...defaultSearchParams };
    setParams(next);
    startTransition(() => {
      router.replace(`/${serializeSearchParams(next)}`);
    });
  }, [router, startTransition]);

  // The default "today" window can be nearly empty at some hours. Widen the
  // date filter once so the page never renders as a dead feed, and say so.
  useEffect(() => {
    if (params.date !== "today" || initial.total >= 6) return;
    if (widenedDefault) return;
    const candidate = defaultDateCounts.find((item) => item.total >= 6) ?? defaultDateCounts.at(-1);
    if (!candidate) return;
    const frame = requestAnimationFrame(() => {
      setWidenedDefault({ date: candidate.date, todayCount: initial.total });
      updateParams({ date: candidate.date });
    });
    return () => cancelAnimationFrame(frame);
  }, [defaultDateCounts, initial.total, params.date, updateParams, widenedDefault]);

  function toggleLocation(location: string) {
    const adding = !params.locations.includes(location);
    const nextLocations = adding
      ? [...params.locations, location]
      : params.locations.filter((item) => item !== location);
    // Selecting a city (e.g. London) implies a global country scope; the
    // U.S.-only default would otherwise hide every European match.
    updateParams({
      locations: nextLocations,
      country: adding && params.country === "us" ? "all" : params.country,
    });
  }

  function toggleTrack(track: RoleTypeFilter) {
    updateParams({
      roleTypes: params.roleTypes.includes(track)
        ? params.roleTypes.filter((item) => item !== track)
        : [...params.roleTypes, track],
    });
  }

  function toggleExperience(experience: ExperienceFilter) {
    const current = params.experience;
    let next: ExperienceFilter[];
    if (experience === "all") next = ["all"];
    else if (current.includes("all")) next = [experience];
    else if (current.includes(experience)) next = current.length === 1 ? current : current.filter((item) => item !== experience);
    else next = [...current, experience];
    updateParams({ experience: next });
  }

  function toggleSort(sort: JobSortKey) {
    if (params.sort === sort) {
      updateParams({ dir: params.dir === "asc" ? "desc" : "asc" });
      return;
    }
    updateParams({
      sort,
      dir: sort === "postedAt" || sort === "updatedAt" || sort === "experience" ? "desc" : "asc",
    });
  }

  function toggleFamily(family: NonTechnicalFamily) {
    const next = params.families.includes(family)
      ? params.families.filter((item) => item !== family)
      : [...params.families, family];
    updateParams({ families: next });
  }

  function switchPortal(portal: "tech" | "non-tech") {
    if (portal === params.portal) return;
    const next = {
      ...params,
      portal,
      roleTypes: portal === "tech" ? [...defaultSearchParams.roleTypes] : [],
      families: portal === "non-tech" ? [...nonTechnicalFamilies] : [...defaultSearchParams.families],
    };
    setParams(next);
    startTransition(() => {
      router.replace(`/${serializeSearchParams(next)}`);
    });
  }

  async function loadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const query = serializeSearchParams(params).replace(/^\?/, "");
      const search = query
        ? `${query}&cursor=${encodeURIComponent(nextCursor)}`
        : `cursor=${encodeURIComponent(nextCursor)}`;
      const response = await fetch(`/api/jobs/search?${search}`);
      if (!response.ok) throw new Error(`Search failed (${response.status})`);
      const data = (await response.json()) as JobSearchResult;
      setResults((previous) => [...previous, ...data.jobs]);
      setNextCursor(data.nextCursor);
    } catch (error) {
      setLoadMoreError(error instanceof Error ? error.message : "Could not load more roles.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  const allTracksSelected =
    params.roleTypes.filter((track) => track !== "Needs Review").length ===
    roleTracks.filter((track) => track !== "Needs Review").length;
  const reviewSelected = params.roleTypes.includes("Needs Review");
  const roleTypeLabel = params.portal === "non-tech"
    ? params.families.length === 0
      ? "No families"
      : params.families.length === nonTechnicalFamilies.length
        ? "All non-tech families"
        : `${params.families.length} families`
    : allTracksSelected
      ? reviewSelected
        ? "All tracks + Needs review"
        : "All tracks · review hidden"
      : `${params.roleTypes.filter((track) => track !== "Needs Review").length} tracks${reviewSelected ? " + review" : ""}`;

  const experienceLabel = params.experience.includes("all")
    ? "All experience"
    : params.experience.map((item) => experienceLabels[item]).join(" · ");
  const dateLabel = dateFilterOptions.find((option) => option.value === params.date)?.label ?? "All dates";

  const providerWarnings = diagnostics.filter((diagnostic) => diagnostic.status !== "ok");

  const effectiveCountryLabel =
    params.locations.length > 0 ? "All countries" : params.country === "us" ? "U.S. based" : "All countries";

  const activeChips: Array<{ label: string; onClear?: () => void }> = [
    { label: effectiveCountryLabel },
    { label: dateLabel },
    { label: experienceLabel },
    { label: roleTypeLabel },
    ...params.locations.map((location) => ({
      label: location,
      onClear: () => toggleLocation(location),
    })),
    ...(params.company ? [{ label: params.company, onClear: () => updateParams({ company: null }) }] : []),
  ];

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <FilterHeading icon="globe">Country</FilterHeading>
        <div className="grid grid-cols-2 gap-2">
          {[["us", "U.S. Based"], ["all", "All"]].map(([value, label]) => (
            <button
              aria-pressed={params.country === value}
              className="filter-btn justify-center"
              key={value}
              onClick={() =>
                updateParams({
                  country: value as "us" | "all",
                  locations: value === "us" ? [] : params.locations,
                })
              }
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <FilterHeading icon="map-pin">Popular cities</FilterHeading>
          <span className="mb-2.5 text-[11px] font-bold text-sky-700 dark:text-sky-400">
            {params.locations.length === 0 ? "Any U.S. city" : `${params.locations.length} selected`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {locationFilters.map((location) => {
            const active = params.locations.includes(location.value);
            return (
              <button
                aria-pressed={active}
                className={`filter-btn justify-between py-2.5 ${active ? "!bg-sky-700 !border-sky-700 !text-white" : ""}`}
                key={location.value}
                onClick={() => toggleLocation(location.value)}
                type="button"
              >
                <span className="truncate">{location.label}</span>
                {active ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <FilterHeading icon="building">Company</FilterHeading>
          <span className="mb-2.5 text-[11px] font-bold text-sky-700 dark:text-sky-400">
            {companyCounts.length} tracked
          </span>
        </div>
        <div className="relative">
          <label className="sr-only" htmlFor="company-filter">Filter by company</label>
          <select
            className="input h-11 appearance-none pr-9 font-semibold"
            id="company-filter"
            onChange={(event) => updateParams({ company: event.target.value || null })}
            value={params.company ?? ""}
          >
            <option value="">All companies</option>
            {companyCounts.map(({ company, count }) => (
              <option key={company} value={company}>
                {company} ({count.toLocaleString("en-US")})
              </option>
            ))}
          </select>
          <Icon name="chevron-down" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      <div>
        <FilterHeading icon={params.portal === "non-tech" ? "users" : "sliders"}>
          {params.portal === "non-tech" ? "Role family" : "Role type"}
        </FilterHeading>
        {params.portal === "non-tech" ? (
          <div className="grid grid-cols-1 gap-1.5">
            {nonTechnicalFamilyOptions.map((family) => {
              const active = params.families.includes(family);
              return (
                <button
                  aria-pressed={active}
                  className={`filter-btn w-full justify-start py-2.5 text-left ${active ? "!border-sky-700 !bg-sky-50 dark:bg-sky-500/15 !text-sky-900" : ""}`}
                  key={family}
                  onClick={() => toggleFamily(family)}
                  type="button"
                >
                  <Icon name={nonTechnicalFamilyIcons[family]} className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="min-w-0 flex-1">{family}</span>
                  {active ? <Icon name="check" className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5">
            {roleTracks.map((track) => {
              const active = params.roleTypes.includes(track as never);
              return (
                <button
                  aria-pressed={active}
                  className={`filter-btn w-full justify-start py-2.5 text-left ${active ? "!border-sky-700 !bg-sky-50 dark:bg-sky-500/15 !text-sky-900" : ""}`}
                  key={track}
                  onClick={() => toggleTrack(track)}
                  type="button"
                >
                  <Icon name={roleTrackIcons[track] ?? "briefcase"} className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="min-w-0 flex-1">{track}</span>
                  {active ? <Icon name="check" className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" /> : null}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {params.portal === "non-tech"
            ? "Families are off by default; nothing is ever deleted, just hidden."
            : "Needs review is selected by default and never silently removes a role."}
        </p>
      </div>

      <div>
        <FilterHeading icon="sparkle">Experience fit</FilterHeading>
        <div className="grid grid-cols-2 gap-2">
          {experienceFilterOptions.map(({ value, label }) => (
            <button
              aria-pressed={params.experience.includes(value)}
              className="filter-btn justify-center"
              key={value}
              onClick={() => toggleExperience(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FilterHeading icon="calendar">Published</FilterHeading>
        <div className="grid grid-cols-3 gap-2">
          {dateFilterOptions.map(({ value, label }) => (
            <button
              aria-pressed={params.date === value}
              className="filter-btn justify-center"
              key={value}
              onClick={() => updateParams({ date: value })}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-secondary w-full" onClick={resetFilters} type="button">
        <Icon name="refresh" className="h-4 w-4" /> Reset to defaults
      </button>
    </div>
  );

  return (
    <section id="openings" className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-label="Portal" className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1" role="group">
            <button
              aria-pressed={params.portal === "tech"}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors ${
                params.portal === "tech"
                  ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
              onClick={() => switchPortal("tech")}
              type="button"
            >
              <Icon name="code" className="h-4 w-4" /> Technical
            </button>
            <button
              aria-pressed={params.portal === "non-tech"}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors ${
                params.portal === "non-tech"
                  ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
              onClick={() => switchPortal("non-tech")}
              type="button"
            >
              <Icon name="users" className="h-4 w-4" /> Non-technical
            </button>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {params.portal === "non-tech"
              ? "Sales, marketing, product, finance, operations & more"
              : "AI, ML, data, forward deployed, quant & infrastructure"}
          </p>
        </div>

        <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <label className="sr-only" htmlFor="job-search">Search jobs</label>
            <input
              autoComplete="off"
              className="input h-11 pl-10"
              id="job-search"
              onChange={(event) => setQDraft(event.target.value)}
              placeholder={`Search ${params.portal === "non-tech" ? "non-technical" : ""} roles…`}
              type="search"
              value={qDraft}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1 sm:flex">
              <button
                aria-label="Change sort direction"
                className="btn btn-secondary !min-h-11 !px-3"
                onClick={() => updateParams({ dir: params.dir === "asc" ? "desc" : "asc" })}
                type="button"
              >
                <Icon name={params.dir === "asc" ? "chevron-up" : "chevron-down"} className="h-4 w-4" />
              </button>
              <label className="sr-only" htmlFor="sort-key">Sort jobs by</label>
              <select
                className="input h-11 w-auto appearance-none pr-8 font-semibold"
                id="sort-key"
                onChange={(event) => toggleSort(event.target.value as JobSortKey)}
                value={params.sort}
              >
                <option value="postedAt">Newest</option>
                <option value="updatedAt">Recently modified</option>
                <option value="experience">Experience</option>
                <option value="company">Company</option>
                <option value="location">Location</option>
                <option value="title">Role title</option>
              </select>
            </div>
            <a className="btn btn-secondary !min-h-11 !px-3" href="/job-boards.csv">
              <Icon name="download" className="h-4 w-4" /> CSV
            </a>
            <button
              aria-expanded={filtersOpen}
              className="btn btn-primary lg:hidden"
              onClick={() => setFiltersOpen(true)}
              type="button"
            >
              <Icon name="filter" className="h-4 w-4" /> Filters
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 text-sm font-bold text-slate-900 dark:text-slate-100">
            {total.toLocaleString("en-US")} roles
            <span className="font-medium text-slate-500 dark:text-slate-400"> · {companiesInResults} companies</span>
          </p>
          <span aria-hidden="true" className="hidden text-slate-300 sm:inline">|</span>
          <div className="flex flex-wrap gap-1.5">
            {activeChips.map((chip) => (
              <span className={`chip ${chip.onClear ? "chip-active" : ""}`} key={chip.label}>
                {chip.label}
                {chip.onClear ? (
                  <button
                    aria-label={`Remove ${chip.label} filter`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-sky-100"
                    onClick={chip.onClear}
                    type="button"
                  >
                    <Icon name="x" className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {activeChips.length > 4 ? (
              <button className="chip border-transparent text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/15" onClick={resetFilters} type="button">
                Clear all
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Desktop sidebar: part of the page flow so it scrolls naturally
            with the page — no separate scrollbar. Only the company list
            inside the Sources card keeps a bounded internal scroll. */}
        <aside className="hidden min-w-0 lg:block lg:self-stretch">
          <div className="space-y-4 pb-4">
            <SectionCard>
              <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-700 text-white">
                    <Icon name="sliders" className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Filters</p>
                    <h2 className="text-base font-bold tracking-[-0.02em]">Tune the feed</h2>
                  </div>
                </div>
              </div>
              <div className="p-5">{filterPanel}</div>
            </SectionCard>

            <SectionCard>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Sources</p>
                  <h2 className="mt-0.5 text-base font-bold tracking-[-0.02em]">Career pages</h2>
                </div>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-400">{boards.length}</span>
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                {boards.map((board) => {
                  const active = params.company === board.company;
                  const count = companyCounts.find((item) => item.company === board.company)?.count ?? 0;
                  return (
                    <div className={`flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 p-3 last:border-0 ${active ? "bg-sky-50 dark:bg-sky-500/15" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`} key={`${board.source}-${board.token}`}>
                      <button
                        aria-label={`Filter by ${board.company}`}
                        aria-pressed={active}
                        className="rounded-xl"
                        onClick={() => updateParams({ company: active ? null : board.company })}
                        type="button"
                      >
                        <CompanyLogo company={board.company} size="md" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          className="block max-w-full truncate text-left text-sm font-bold text-slate-950 dark:text-slate-50 hover:text-sky-800 dark:hover:text-sky-300"
                          onClick={() => updateParams({ company: active ? null : board.company })}
                          type="button"
                        >
                          {board.company}
                        </button>
                        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {board.source} · {count.toLocaleString("en-US")} jobs
                        </p>
                      </div>
                      <a
                        aria-label={`Open ${board.company} careers page`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors hover:border-sky-300 hover:text-sky-800 dark:hover:text-sky-300"
                        href={board.boardUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Icon name="external-link" className="h-4 w-4" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        </aside>

        {/* Mobile filter sheet */}
        {filtersOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Filters" aria-modal="true">
            <div className="absolute inset-0 bg-slate-950/40" onClick={() => setFiltersOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-white dark:bg-slate-800 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold tracking-[-0.02em]">Filters</h2>
                <button
                  aria-label="Close filters"
                  className="btn btn-ghost !min-h-10 !px-3"
                  onClick={() => setFiltersOpen(false)}
                  type="button"
                >
                  <Icon name="x" className="h-5 w-5" />
                </button>
              </div>
              {filterPanel}
              <button className="btn btn-primary mt-6 w-full" onClick={() => setFiltersOpen(false)} type="button">
                Show {total.toLocaleString("en-US")} roles
              </button>
            </div>
          </div>
        ) : null}

        {/* Results */}
        <div id="latest-jobs" className="min-w-0 scroll-mt-24">
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(120px,0.7fr)_minmax(150px,0.8fr)_minmax(120px,0.7fr)_minmax(110px,0.55fr)_110px] items-center gap-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 xl:grid">
              {([
                ["title", "Role"], ["company", "Company"], ["experience", "Experience"],
                ["location", "Location"], ["postedAt", "Published"], ["updatedAt", "Modified"],
              ] as const).map(([key, label]) => (
                <button
                  aria-label={`Sort by ${label}`}
                  className={`flex items-center gap-1.5 rounded-md py-1 transition-colors hover:text-sky-800 dark:hover:text-sky-300 ${key === "postedAt" || key === "updatedAt" ? "justify-self-end text-right" : "justify-self-start text-left"}`}
                  key={key}
                  onClick={() => toggleSort(key)}
                  type="button"
                >
                  {label}
                  <span aria-hidden="true" className={params.sort === key ? "text-sky-700 dark:text-sky-400" : "text-slate-300"}>
                    {params.sort === key ? (params.dir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              ))}
            </div>

            {isPending ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center bg-white/60 py-2 backdrop-blur-sm" aria-live="polite">
                <span className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-400 shadow-sm ring-1 ring-slate-200">
                  <Icon name="refresh" className="h-3.5 w-3.5 animate-spin text-sky-700 dark:text-sky-400" /> Updating results…
                </span>
              </div>
            ) : null}

            {widenedDefault ? (
              <p className="mb-3 rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 px-4 py-3 text-xs font-semibold leading-5 text-sky-800 dark:text-sky-300">
                Only {widenedDefault.todayCount} {widenedDefault.todayCount === 1 ? "role" : "roles"} published today — showing the last{" "}
                {dateFilterOptions.find((option) => option.value === widenedDefault.date)?.label ?? widenedDefault.date} instead.
              </p>
            ) : null}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.map((job) => (
                <article className="group px-4 py-4 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-5" key={job.id}>
                  <div className="flex items-start gap-3.5">
                    <span className="mt-0.5 hidden sm:inline-flex">
                      <CompanyLogo company={job.company} size="sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400">{job.category}</span>
                        <span className={`badge ${job.badgeClass}`}>
                          <span aria-hidden="true" className="badge-dot bg-current opacity-60" />
                          {job.badgeLabel}
                        </span>
                      </div>
                      <h3 className="mt-2">
                        <a
                          className="inline-flex max-w-full items-start gap-1.5 text-[15px] font-bold leading-6 text-slate-950 dark:text-slate-50 transition-colors hover:text-sky-800 dark:hover:text-sky-300"
                          href={job.absoluteUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span>{job.title}</span>
                          <Icon name="arrow-up-right" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                        </a>
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <CompanyLogo company={job.company} size="sm" className="!h-4 !w-4 !rounded !text-[8px] sm:hidden" />
                          <span className="sm:hidden">{job.company}</span>
                          <span className="hidden sm:inline">{job.company}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <Icon name="map-pin" className="h-3.5 w-3.5" /> {job.location}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400">
                            <Icon name="calendar" className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Published</p>
                            <p className="text-[13px] font-bold leading-4 text-sky-900">{formatRelativeDate(job.postedAt)}</p>
                            <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-400 dark:text-slate-500">{formatExactDate(job.postedAt) ?? "—"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            <Icon name="clock" className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Modified</p>
                            <p className="text-[13px] font-bold leading-4 text-slate-600 dark:text-slate-400">{formatRelativeDate(job.updatedAt)}</p>
                            <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-400 dark:text-slate-500">{job.updatedAt ? (formatExactDate(job.updatedAt) ?? "—") : "—"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <a
                      className="btn btn-secondary hidden !min-h-9 !rounded-lg !px-3 !text-xs sm:inline-flex"
                      href={job.absoluteUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View <Icon name="arrow-up-right" className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </article>
              ))}

              {results.length === 0 && !isPending ? (
                <div className="px-5 py-16 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                    <Icon name="search" className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold tracking-[-0.03em] text-slate-950 dark:text-slate-50">No roles published today</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Most career pages only publish a handful of postings each day, so the default
                    “today” window is often sparse. Widen the date filter to see this week’s openings.
                  </p>
                  <button className="btn btn-primary mt-5" onClick={resetFilters} type="button">
                    <Icon name="refresh" className="h-4 w-4" /> Reset to defaults
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-center gap-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-5 py-4">
              {nextCursor ? (
                <button
                  className="btn btn-secondary w-full sm:w-auto"
                  disabled={isLoadingMore}
                  onClick={loadMore}
                  type="button"
                >
                  {isLoadingMore ? (
                    <><Icon name="refresh" className="h-4 w-4 animate-spin" /> Loading…</>
                  ) : (
                    <>Load more roles</>
                  )}
                </button>
              ) : total > 0 ? (
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">All {total.toLocaleString("en-US")} matching roles shown.</p>
              ) : null}
              {loadMoreError ? <p className="text-xs font-semibold text-rose-700">{loadMoreError}</p> : null}

              <div className="flex flex-col items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:flex-row sm:gap-4">
                <p>Last checked {formatJobDate(lastCheckedAt.toISOString())}</p>
                <p className="hidden text-slate-300 sm:inline">·</p>
                <p>Data fetched at {formatJobDate(snapshotFetchedAt)}</p>
                {providerWarnings.length > 0 ? (
                  <>
                    <p className="hidden text-slate-300 sm:inline">·</p>
                    <p className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                      <Icon name="alert-triangle" className="h-3.5 w-3.5" />
                      {providerWarnings.length} source{providerWarnings.length === 1 ? "" : "s"} unavailable
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Mobile: sources list */}
          <div className="mt-4 lg:hidden">
            <SectionCard>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Sources</p>
                  <h2 className="mt-0.5 text-base font-bold tracking-[-0.02em]">Career pages</h2>
                </div>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-400">{boards.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-px sm:grid-cols-2">
                {boards.map((board) => {
                  const active = params.company === board.company;
                  const count = companyCounts.find((item) => item.company === board.company)?.count ?? 0;
                  return (
                    <button
                      className={`flex items-center gap-3 p-3 text-left transition-colors ${active ? "bg-sky-50 dark:bg-sky-500/15" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
                      key={`${board.source}-${board.token}`}
                      onClick={() => updateParams({ company: active ? null : board.company })}
                      type="button"
                    >
                      <CompanyLogo company={board.company} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-950 dark:text-slate-50">{board.company}</span>
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {board.source} · {count.toLocaleString("en-US")} jobs
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </section>
  );
}
