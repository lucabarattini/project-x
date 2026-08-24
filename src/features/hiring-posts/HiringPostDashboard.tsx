"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { CompanyLogo } from "@/features/companies/CompanyLogo";
import { FaceAvatar } from "@/features/network/FaceAvatar";
import type { ContactType, HiringPost } from "./types";

type Props = {
  configured: boolean;
  error: string | null;
  posts: HiringPost[];
  renderedAt: string;
  scanCadenceHours: number;
  companyCycleHours: number;
  source: "apify" | "development-fixture" | "empty";
  trackedCompanyCount: number;
  updatedAt: string | null;
};

type AgeFilter = "today" | "24h" | "3d" | "7d" | "14d" | "21d";
type InboxView = "queue" | "contacted" | "hidden";
type SignalAudience = "all" | "technical" | "non-technical";
type RegionFilter = "us" | "all";
type LeadDecision = "contacted" | "hidden";
type LeadDecisions = Record<string, LeadDecision>;

const ageMilliseconds: Record<Exclude<AgeFilter, "today">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
  "21d": 21 * 24 * 60 * 60 * 1000,
};

const ageCandidates: AgeFilter[] = ["today", "24h", "3d", "7d", "14d", "21d"];

const ageFilterLabels: Record<Exclude<AgeFilter, "today">, string> = {
  "24h": "24 hours",
  "3d": "3 days",
  "7d": "7 days",
  "14d": "14 days",
  "21d": "21 days",
};

/**
 * Emoji-labelled location filters, matched case-insensitively against the
 * post's location label. Labels are free-form (city, region, or "Location not
 * verified"), so each filter matches several spellings and nearby cities.
 */
const locationFilters: Array<{ value: string; emoji: string; pattern: RegExp }> = [
  { value: "New York", emoji: "🗽", pattern: /new york|\bnyc\b|\bny\b/iu },
  { value: "Seattle", emoji: "☕", pattern: /seattle/iu },
  { value: "San Francisco", emoji: "🌉", pattern: /san francisco|bay area|mountain view|sunnyvale|palo alto|san jose/iu },
  { value: "Austin", emoji: "🏙️", pattern: /austin/iu },
  { value: "Boston", emoji: "🍁", pattern: /boston/iu },
  { value: "Miami", emoji: "🌴", pattern: /miami/iu },
  { value: "Chicago", emoji: "🏙️", pattern: /chicago/iu },
  { value: "Washington", emoji: "🏛️", pattern: /washington|arlington/iu },
  { value: "London", emoji: "🇬🇧", pattern: /london|united kingdom/iu },
  { value: "Berlin", emoji: "🇩🇪", pattern: /berlin/iu },
  { value: "Paris", emoji: "🇫🇷", pattern: /paris/iu },
  { value: "Amsterdam", emoji: "🇳🇱", pattern: /amsterdam/iu },
  { value: "Zurich", emoji: "🇨🇭", pattern: /zurich|zürich/iu },
  { value: "Dublin", emoji: "🇮🇪", pattern: /dublin/iu },
  { value: "Madrid", emoji: "🇪🇸", pattern: /madrid/iu },
  { value: "Barcelona", emoji: "🇪🇸", pattern: /barcelona/iu },
  { value: "Stockholm", emoji: "🇸🇪", pattern: /stockholm/iu },
  { value: "Munich", emoji: "🇩🇪", pattern: /munich|münchen/iu },
  { value: "Milan", emoji: "🇮🇹", pattern: /milan|milano/iu },
  { value: "Warsaw", emoji: "🇵🇱", pattern: /warsaw/iu },
  { value: "Remote", emoji: "🏠", pattern: /remote/iu },
  { value: "United States", emoji: "🇺🇸", pattern: /united states|\busa\b|\bu\.s\./iu },
  { value: "UK", emoji: "🇬🇧", pattern: /united kingdom|\buk\b/iu },
  { value: "Europe", emoji: "🌍", pattern: /europe|emea/iu },
  { value: "Canada", emoji: "🇨🇦", pattern: /canada|toronto|ontario/iu },
  { value: "India", emoji: "🇮🇳", pattern: /india|bengaluru|bangalore|hyderabad|chennai|gurgaon|noida|mumbai|delhi/iu },
  { value: "Singapore", emoji: "🇸🇬", pattern: /singapore/iu },
  { value: "Japan", emoji: "🇯🇵", pattern: /japan|tokyo/iu },
  { value: "Australia", emoji: "🇦🇺", pattern: /australia|sydney|melbourne/iu },
  { value: "Brazil", emoji: "🇧🇷", pattern: /brazil|são paulo|sao paulo/iu },
  { value: "Israel", emoji: "🇮🇱", pattern: /israel/iu },
];

const contactLabels: Record<ContactType, string> = {
  "direct-team": "Hiring team",
  recruiter: "Recruiter",
  "employee-share": "Employee share",
};

const decisionStorageKey = "job-radar:hiring-signal-decisions:v1";
const decisionEventName = "job-radar:hiring-signal-decisions";
const emptyDecisionSnapshot = "{}";

function subscribeToDecisions(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(decisionEventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(decisionEventName, callback);
  };
}

function decisionSnapshot() {
  try {
    return window.localStorage.getItem(decisionStorageKey) ?? emptyDecisionSnapshot;
  } catch {
    return emptyDecisionSnapshot;
  }
}

function useLeadDecisions() {
  const serialized = useSyncExternalStore(
    subscribeToDecisions,
    decisionSnapshot,
    () => emptyDecisionSnapshot,
  );
  const decisions = useMemo(() => {
    try {
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, LeadDecision] => (
          entry[1] === "contacted" || entry[1] === "hidden"
        )),
      );
    } catch {
      return {};
    }
  }, [serialized]);

  function setDecision(postId: string, decision: LeadDecision | null) {
    const next: LeadDecisions = { ...decisions };
    if (decision) next[postId] = decision;
    else delete next[postId];
    try {
      window.localStorage.setItem(decisionStorageKey, JSON.stringify(next));
      window.dispatchEvent(new Event(decisionEventName));
    } catch {
      // The inbox still works if browser storage is unavailable.
    }
  }

  return { decisions, setDecision };
}

function relativeAge(value: string, now: number) {
  const elapsed = Math.max(0, now - Date.parse(value));
  const hours = Math.floor(elapsed / (60 * 60 * 1000));
  if (hours < 1) return "Less than 1 hour ago";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function contactBadgeClass(type: ContactType) {
  if (type === "direct-team") return "border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300";
  if (type === "recruiter") return "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300";
  return "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300";
}

function qualityBadge(post: HiringPost) {
  if (post.matchStatus === "review") {
    return { label: "Verify", className: "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300", dot: "bg-amber-500" };
  }
  if (post.score >= 85) {
    return { label: "Strong", className: "border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 text-sky-800 dark:text-sky-300", dot: "bg-sky-500" };
  }
  if (post.score >= 70) {
    return { label: "Good", className: "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300", dot: "bg-emerald-500" };
  }
  return { label: "Worth a look", className: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400", dot: "bg-slate-400" };
}

function firstName(value: string) {
  return value.trim().split(/[\s,]+/u)[0] || "them";
}

function EmptyState({ view, audience }: { view: InboxView; audience: SignalAudience }) {
  const copy: Record<InboxView, [string, string]> = {
    queue: ["Inbox cleared", "There are no unhandled high-confidence leads in this view."],
    contacted: ["No contacted leads yet", "After you send a message, mark the lead contacted and it will appear here."],
    hidden: ["No hidden leads", "Leads you intentionally hide can be restored from here."],
  };
  const audienceSuffix = audience === "technical"
    ? " Technical signals are highlighted when they arrive."
    : audience === "non-technical"
      ? " Business signals are highlighted when they arrive."
      : "";
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-6 py-14 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400">
        <Icon name="check" className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-xl font-bold text-slate-950 dark:text-slate-50">{copy[view][0]}</h2>
      <p className="mx-auto mt-2 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-400">{copy[view][1]}{audienceSuffix}</p>
    </div>
  );
}

/**
 * Real profile photo when the feed provides one, otherwise the illustrated
 * avatar fallback. LinkedIn media rejects cross-origin referrers, so the
 * image is loaded with a stripped referrer.
 */
function AuthorPhoto({
  name,
  imageUrl,
  className = "h-11 w-11",
  decorative = false,
}: {
  name: string;
  imageUrl: string | null;
  className?: string;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) {
    return <FaceAvatar name={name} className={className} decorative={decorative} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={decorative ? "" : `${name} profile photo`}
      className={`shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={imageUrl}
    />
  );
}

export function HiringPostDashboard({
  configured,
  error,
  posts,
  renderedAt,
  scanCadenceHours,
  companyCycleHours,
  source,
  trackedCompanyCount,
  updatedAt,
}: Props) {
  const [view, setView] = useState<InboxView>("queue");
  const [audience, setAudience] = useState<SignalAudience>("non-technical");
  const [company, setCompany] = useState("all");
  const [contactType, setContactType] = useState<ContactType | "all">("all");
  const [age, setAge] = useState<AgeFilter>("today");
  const [ageTouched, setAgeTouched] = useState(false);
  const [region, setRegion] = useState<RegionFilter>("us");
  const [locations, setLocations] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const { decisions, setDecision } = useLeadDecisions();
  const renderedAtTimestamp = Date.parse(renderedAt);

  const companies = useMemo(() => [...new Set(
    posts.filter((post) => post.company !== "Unknown").map((post) => post.company),
  )].sort((left, right) => left.localeCompare(right)), [posts]);

  const counts = useMemo(() => {
    const byAudience = (post: HiringPost) =>
      audience === "all" || (audience === "technical") === (post.roleFamily === "Technical");
    return {
      queue: posts.filter((post) => byAudience(post) && post.matchStatus !== "excluded" && !decisions[post.id]).length,
      contacted: posts.filter((post) => byAudience(post) && decisions[post.id] === "contacted").length,
      hidden: posts.filter((post) => byAudience(post) && decisions[post.id] === "hidden").length,
      direct: posts.filter((post) => post.matchStatus === "match" && post.contactType === "direct-team").length,
      recruiters: posts.filter((post) => post.matchStatus === "match" && post.contactType === "recruiter").length,
      excluded: posts.filter((post) => post.matchStatus === "excluded").length,
      technical: posts.filter((post) => post.roleFamily === "Technical").length,
    };
  }, [audience, decisions, posts]);

  // These three feed matchesFilters, which is memoized below so the filtered
  // list can depend on it by identity. Recomputing them every render would
  // change that identity every render and defeat the memo.
  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query]);
  const selectedLocations = useMemo(
    () => locationFilters.filter((item) => locations.includes(item.value)),
    [locations],
  );
  const todayStart = useMemo(() => {
    const startOfToday = new Date(renderedAtTimestamp);
    startOfToday.setHours(0, 0, 0, 0);
    return startOfToday.getTime();
  }, [renderedAtTimestamp]);

  const matchesFilters = useCallback(function matchesFilters(post: HiringPost, ageValue: AgeFilter) {
    const decision = decisions[post.id];
    const viewMatches = view === "queue"
      ? post.matchStatus !== "excluded" && !decision
      : decision === view;
    const audienceMatches = audience === "all"
      || (audience === "technical") === (post.roleFamily === "Technical");
    const regionMatches = region === "all" || post.location.status !== "outside-us";
    const postedTimestamp = Date.parse(post.postedAt);
    const elapsed = renderedAtTimestamp - postedTimestamp;
    const ageMatches = ageValue === "today"
      ? postedTimestamp >= todayStart && elapsed >= -5 * 60 * 1000
      : elapsed >= -5 * 60 * 1000 && elapsed <= ageMilliseconds[ageValue];
    const locationMatches = selectedLocations.length === 0
      || selectedLocations.some((item) => item.pattern.test(post.location.label));
    const textMatches = !normalizedQuery || [
      post.opportunityTitle,
      post.author.name,
      post.author.headline,
      post.content,
      post.roleFamily,
      post.location.label,
      post.company,
    ].join(" ").toLowerCase().includes(normalizedQuery);

    return viewMatches
      && audienceMatches
      && regionMatches
      && (company === "all" || post.company === company)
      && (contactType === "all" || post.contactType === contactType)
      && ageMatches
      && locationMatches
      && textMatches;
  }, [audience, company, contactType, decisions, normalizedQuery, region, renderedAtTimestamp, selectedLocations, todayStart, view]);

  const ageCounts = useMemo(() => {
    const countsByAge = new Map<AgeFilter, number>();
    for (const candidate of ageCandidates) {
      let count = 0;
      for (const post of posts) {
        if (matchesFilters(post, candidate)) count += 1;
      }
      countsByAge.set(candidate, count);
    }
    return countsByAge;
  }, [matchesFilters, posts]);

  // The "today" window is calendar-day based and can be near-empty at some
  // hours. When the visitor hasn't touched the date filter and today yields
  // almost nothing, widen automatically so the feed never renders dead.
  const minimumFeedSize = 6;
  const effectiveAge = !ageTouched && age === "today"
    ? (ageCounts.get("today") ?? 0) >= minimumFeedSize
      ? "today"
      : ageCandidates.find((candidate) => (ageCounts.get(candidate) ?? 0) >= minimumFeedSize)
        ?? ageCandidates.filter((candidate) => (ageCounts.get(candidate) ?? 0) > 0).at(-1)
        ?? "today"
    : age;

  // Every input matchesFilters closes over has to be listed: the array below
  // once held only [posts, effectiveAge], so changing Company (or contact,
  // region, location, query) returned the memoized list unchanged and the
  // filter looked dead. It only ever appeared to work when the change also
  // moved effectiveAge through ageCounts.
  const filtered = useMemo(() => {
    return posts.filter((post) => matchesFilters(post, effectiveAge));
  }, [effectiveAge, matchesFilters, posts]);

  // Metadata-only posts (see contentOmitted) fetch their full text on demand,
  // batched in a single request, so the initial HTML stays small.
  const [fetchedContent, setFetchedContent] = useState<Record<string, { content: string; reasons: string[]; exclusionReasons: string[] }>>({});
  useEffect(() => {
    const omittedIds = filtered
      .filter((post) => post.contentOmitted && !fetchedContent[post.id])
      .map((post) => post.id);
    if (omittedIds.length === 0) return;
    let cancelled = false;
    fetch(`/api/hiring-posts/content?ids=${encodeURIComponent(omittedIds.join(","))}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { posts: Record<string, { content: string; reasons: string[]; exclusionReasons: string[] }> }) => {
        if (!cancelled && data.posts) {
          setFetchedContent((previous) => ({ ...previous, ...data.posts }));
        }
      })
      .catch(() => {
        // Keep the metadata-only fallback; the card still renders.
      });
    return () => {
      cancelled = true;
    };
  }, [filtered, fetchedContent]);

  const visiblePosts = filtered.map((post) => {
    const extra = post.contentOmitted ? fetchedContent[post.id] : undefined;
    return extra
      ? { ...post, content: extra.content, reasons: extra.reasons, exclusionReasons: extra.exclusionReasons }
      : post;
  });

  const widenedNote = effectiveAge !== age
    ? `Only ${ageCounts.get("today") ?? 0} ${(ageCounts.get("today") ?? 0) === 1 ? "post" : "posts"} published today — showing the last ${ageFilterLabels[effectiveAge as Exclude<AgeFilter, "today">]} instead.`
    : null;

  const filtersAreActive = audience !== "non-technical" || company !== "all" || contactType !== "all" || age !== "today" || region !== "us" || locations.length > 0 || query !== "";
  const viewOptions: Array<{ key: InboxView; label: string; count: number; hint: string; icon: "radar" | "check" | "x" }> = [
    { key: "queue", label: "To contact", count: counts.queue, hint: `${counts.direct} hiring team · ${counts.recruiters} recruiters`, icon: "radar" },
    { key: "contacted", label: "Contacted", count: counts.contacted, hint: "Saved on this browser", icon: "check" },
    { key: "hidden", label: "Hidden", count: counts.hidden, hint: "Restorable leads", icon: "x" },
  ];

  function toggleLocation(value: string) {
    setLocations((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function markContacted(post: HiringPost) {
    setDecision(post.id, decisions[post.id] === "contacted" ? null : "contacted");
  }

  function markHidden(post: HiringPost) {
    setDecision(post.id, decisions[post.id] === "hidden" ? null : "hidden");
  }

  function clearFilters() {
    setAudience("non-technical");
    setCompany("all");
    setContactType("all");
    setAge("today");
    setAgeTouched(false);
    setRegion("us");
    setLocations([]);
    setQuery("");
  }

  return (
    <>
      {!configured ? (
        <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-5 py-4 text-sm leading-6 text-amber-950">
          <p className="font-bold">Development preview</p>
          <p>{source === "development-fixture" ? "Showing the local Apify export." : "Configure Apify and ingest the first run."}</p>
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 px-5 py-4 text-sm font-semibold text-rose-900 dark:text-rose-300" role="alert">
          Live feed error: {error}
        </div>
      ) : null}

      {/* Audience toggle */}
      <section aria-label="Signal audience" className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex w-full flex-wrap gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 sm:w-auto" role="group">
          {([
            ["all", "All signals"],
            ["technical", "Technical"],
            ["non-technical", "Non-technical"],
          ] as const).map(([value, label]) => (
            <button
              aria-pressed={audience === value}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-bold transition-colors sm:flex-none sm:px-4 ${
                audience === value
                  ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
              key={value}
              onClick={() => setAudience(value)}
              type="button"
            >
              <Icon name={value === "technical" ? "code" : value === "non-technical" ? "users" : "layers"} className="h-4 w-4" />
              {label}
              {value === "all" ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${audience === "all" ? "bg-white/15 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>{posts.length}</span> : null}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {counts.technical} technical signals in the feed
          <span className="mx-1.5 text-slate-300">·</span>
          Technical and business roles use separate search queries.
        </p>
      </section>

      <section aria-label="Outreach inbox views" className="grid overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-4">
        {viewOptions.map((option) => (
          <button
            aria-pressed={view === option.key}
            className={`min-h-24 border-b border-slate-200 dark:border-slate-700 p-4 text-left transition-colors duration-200 sm:border-r lg:border-b-0 ${view === option.key ? "bg-sky-700 text-white" : "bg-white dark:bg-slate-800 text-slate-950 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
            key={option.key}
            onClick={() => setView(option.key)}
            type="button"
          >
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className={`block text-xs font-bold uppercase tracking-[0.14em] ${view === option.key ? "text-sky-100" : "text-slate-500 dark:text-slate-400"}`}>{option.label}</span>
                <span className="mt-1 block text-3xl font-bold tracking-[-0.05em]">{option.count}</span>
              </span>
              <Icon name={option.icon} className={`h-5 w-5 ${view === option.key ? "text-sky-100" : "text-slate-400 dark:text-slate-500"}`} />
            </span>
            <span className={`mt-1.5 block truncate text-xs ${view === option.key ? "text-sky-50" : "text-slate-500 dark:text-slate-400"}`}>{option.hint}</span>
          </button>
        ))}
      </section>

      <section aria-label="Filter outreach leads" className="card mt-5 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_repeat(4,minmax(140px,0.8fr))]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Search leads</span>
            <span className="relative block">
              <Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
              <input
                className="input h-11 pl-10"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Role, person, company, location"
                type="search"
                value={query}
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Company</span>
            <select className="input h-11 font-semibold" onChange={(event) => setCompany(event.target.value)} value={company}>
              <option value="all">All companies</option>
              {companies.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Contact</span>
            <select className="input h-11 font-semibold" onChange={(event) => setContactType(event.target.value as typeof contactType)} value={contactType}>
              <option value="all">All contacts</option>
              <option value="direct-team">Hiring team</option>
              <option value="recruiter">Recruiters</option>
              <option value="employee-share">Employee shares</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Region</span>
            <select className="input h-11 font-semibold" onChange={(event) => setRegion(event.target.value as RegionFilter)} value={region}>
              <option value="us">🇺🇸 U.S. only</option>
              <option value="all">🌍 All regions</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Published</span>
            <select className="input h-11 font-semibold" onChange={(event) => { setAge(event.target.value as AgeFilter); setAgeTouched(true); }} value={age}>
              <option value="today">Today</option>
              <option value="24h">Last 24 hours</option>
              <option value="3d">Last 3 days</option>
              <option value="7d">Last 7 days</option>
              <option value="14d">Last 14 days</option>
              <option value="21d">Last 21 days</option>
            </select>
          </label>
        </div>

        <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              <Icon name="map-pin" className="mr-1 inline h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              Location
            </p>
            {locations.length > 0 ? (
              <button className="min-h-8 text-xs font-bold text-sky-800 dark:text-sky-300 underline decoration-sky-300 dark:decoration-sky-500/40 underline-offset-4" onClick={() => setLocations([])} type="button">
                Clear locations
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {locationFilters.map((item) => {
              const active = locations.includes(item.value);
              return (
                <button
                  aria-pressed={active}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors ${
                    active
                      ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                  key={item.value}
                  onClick={() => toggleLocation(item.value)}
                  type="button"
                >
                  <span aria-hidden="true">{item.emoji}</span>
                  {item.value}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
          <p><span className="font-bold text-slate-900 dark:text-slate-100">{filtered.length}</span> visible · New batch every {scanCadenceHours}h · All {trackedCompanyCount} companies every {companyCycleHours}h</p>
          <div className="flex items-center gap-3">
            {filtersAreActive ? (
              <button className="min-h-11 font-bold text-sky-800 dark:text-sky-300 underline decoration-sky-300 dark:decoration-sky-500/40 underline-offset-4" onClick={clearFilters} type="button">Clear filters</button>
            ) : null}
            <p className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {updatedAt ? `Synced ${relativeAge(updatedAt, renderedAtTimestamp)}` : "Waiting for first sync"}
            </p>
          </div>
        </div>
      </section>

      {widenedNote ? (
        <p className="mt-4 rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 px-4 py-3 text-xs font-semibold leading-5 text-sky-800 dark:text-sky-300">
          {widenedNote}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-5"><EmptyState view={view} audience={audience} /></div>
      ) : (
        <section className="mt-5 space-y-4" aria-label={`${viewOptions.find((option) => option.key === view)?.label ?? "Outreach"} leads`}>
          {visiblePosts.map((post) => {
            const decision = decisions[post.id];
            const quality = qualityBadge(post);
            const isTechnical = post.roleFamily === "Technical";
            return (
              <SignalCard
                decision={decision}
                isTechnical={isTechnical}
                key={post.id}
                onContacted={() => markContacted(post)}
                onHidden={() => markHidden(post)}
                post={post}
                quality={quality}
                renderedAtTimestamp={renderedAtTimestamp}
              />
            );
          })}
        </section>
      )}

      <p className="mt-6 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
        {counts.excluded} low-signal or out-of-scope posts were archived automatically. Contacted and hidden states are private to this browser.
      </p>
    </>
  );
}

function SignalCard({
  post,
  decision,
  isTechnical,
  quality,
  renderedAtTimestamp,
  onContacted,
  onHidden,
}: {
  post: HiringPost;
  decision: LeadDecision | undefined;
  isTechnical: boolean;
  quality: { label: string; className: string; dot: string };
  renderedAtTimestamp: number;
  onContacted: () => void;
  onHidden: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const profileUrl = post.author.linkedinUrl ?? post.linkedinUrl;
  const postedLabel = relativeAge(post.postedAt, renderedAtTimestamp);
  const postedAbsolute = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(post.postedAt));

  const postLinks = useMemo(() => {
    const urls = (post.content ?? "").match(/https?:\/\/[^\s<>"']+/giu) ?? [];
    return [...new Set(urls.map((url) => url.replace(/[),.;!?]+$/u, "")))].slice(0, 6);
  }, [post.content]);

  function copyPostText() {
    try {
      void navigator.clipboard.writeText(post.content || post.opportunityTitle);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; the button simply does nothing.
    }
  }

  function linkLabel(url: string) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./u, "");
      const path = parsed.pathname.replace(/^\//u, "").slice(0, 24);
      return path ? `${host}/${path}` : host;
    } catch {
      return url.slice(0, 32);
    }
  }

  const why = post.matchStatus === "review"
    ? [...post.reasons, ...post.exclusionReasons]
    : post.reasons;

  return (
    <article className="card overflow-hidden">
      <div className="p-5 sm:p-6">
        {/* Author row: name + post time immediately next to it */}
        <div className="flex items-start gap-3.5">
          <AuthorPhoto name={post.author.name} imageUrl={post.author.imageUrl} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[15px] font-bold leading-6 text-slate-950 dark:text-slate-50">{post.author.name}</p>
              <a
                aria-label={`View the LinkedIn post published ${postedAbsolute}`}
                className="inline-flex items-center gap-1 text-[13px] font-bold leading-6 text-sky-700 dark:text-sky-400 underline-offset-2 transition-colors hover:underline"
                href={post.linkedinUrl}
                rel="noreferrer"
                target="_blank"
                title={`Published ${postedAbsolute}`}
              >
                · {postedLabel}
                <Icon name="external-link" className="h-3 w-3 shrink-0" />
              </a>
              {isTechnical ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">
                  <Icon name="code" className="h-2.5 w-2.5" /> Tech
                </span>
              ) : null}
              <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${contactBadgeClass(post.contactType)}`}>
                {contactLabels[post.contactType]}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${quality.className}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${quality.dot}`} />
                {quality.label}
              </span>
              {decision === "contacted" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:text-sky-300">
                  <Icon name="check" className="h-2.5 w-2.5" /> Contacted
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs leading-5 text-slate-500 dark:text-slate-400">
              {post.author.headline || post.roleFamily}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] font-semibold text-slate-700 dark:text-slate-300">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <CompanyLogo company={post.company} size="sm" decorative className="!h-4 !w-4 !rounded !text-[8px]" />
                <span className="truncate">{post.company}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1 text-slate-600 dark:text-slate-400">
                <Icon name="map-pin" className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                <span className="truncate">{post.location.label}</span>
              </span>
              {post.opportunityTitle ? (
                <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-800 dark:text-violet-300">
                  <Icon name="briefcase" className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{post.opportunityTitle}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Full post text — readable, no click required */}
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-sky-300 dark:border-l-sky-500/60 bg-white dark:bg-slate-800">
          <p className="whitespace-pre-line break-words px-4 py-4 text-[15px] leading-7 text-slate-800 dark:text-slate-200 sm:px-5">
            {post.content || "Link-only post. The role details were recovered from its LinkedIn job card."}
          </p>
          {postLinks.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 px-4 py-3 sm:px-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Links in post</span>
              {postLinks.map((url) => (
                <a
                  className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-400 transition-colors hover:border-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/15"
                  href={url}
                  key={url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon name="external-link" className="h-3 w-3 shrink-0" />
                  <span className="truncate">{linkLabel(url)}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a className="btn btn-primary !min-h-10 !px-4 !text-sm" href={profileUrl} rel="noreferrer" target="_blank">
            Open profile to message <Icon name="external-link" className="h-4 w-4" />
          </a>
          {post.opportunityUrl ? (
            <a className="btn btn-secondary !min-h-10 !px-4 !text-sm" href={post.opportunityUrl} rel="noreferrer" target="_blank">
              Open the linked job posting <Icon name="external-link" className="h-4 w-4" />
            </a>
          ) : null}
          <button
            aria-pressed={decision === "contacted"}
            className={decision === "contacted" ? "btn btn-primary !min-h-10 !px-4 !text-sm" : "btn btn-ghost !min-h-10 !px-4 !text-sm"}
            onClick={onContacted}
            type="button"
          >
            <Icon name="check" className="h-4 w-4" />
            {decision === "contacted" ? "Contacted" : "Mark contacted"}
          </button>
          <button
            aria-pressed={decision === "hidden"}
            className={decision === "hidden" ? "btn btn-secondary !min-h-10 !px-4 !text-sm" : "btn btn-ghost !min-h-10 !px-4 !text-sm"}
            onClick={onHidden}
            type="button"
          >
            <Icon name="x" className="h-4 w-4" />
            {decision === "hidden" ? "Restore" : "Hide"}
          </button>
          <button
            aria-label="Copy post text"
            className="btn btn-ghost !min-h-10 !px-3 !text-sm"
            onClick={copyPostText}
            title="Copy post text"
            type="button"
          >
            <Icon name={copied ? "check" : "upload"} className="h-4 w-4" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {why.length > 0 ? (
          <details className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
            <summary className="min-h-9 cursor-pointer text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Why it surfaced · {firstName(post.author.name)}
            </summary>
            <ul className="space-y-2 pb-1 pt-2">
              {why.slice(0, 6).map((reason) => (
                <li className="flex gap-2 text-xs leading-5 text-slate-700 dark:text-slate-300" key={reason}>
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </article>
  );
}
