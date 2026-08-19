"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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

type AgeFilter = "24h" | "3d" | "7d";
type InboxView = "queue" | "review" | "contacted" | "hidden";
type SignalAudience = "all" | "technical" | "non-technical";
type LeadDecision = "contacted" | "hidden";
type LeadDecisions = Record<string, LeadDecision>;

const ageMilliseconds: Record<AgeFilter, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const contactLabels: Record<ContactType, string> = {
  "direct-team": "Hiring team",
  recruiter: "Recruiter",
  "employee-share": "Employee share",
};

const decisionStorageKey = "job-radar:hiring-signal-decisions:v1";
const decisionEventName = "job-radar:hiring-signal-decisions";
const emptyDecisionSnapshot = "{}";

const stopWords = new Set([
  "and", "for", "the", "with", "our", "your", "you", "are", "is", "a", "an", "of", "to", "in", "on", "at", "role", "roles", "team", "new", "open", "opening", "senior", "lead", "sr", "ii", "iii",
]);

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
  if (type === "direct-team") return "border-sky-200 bg-sky-50 text-sky-800";
  if (type === "recruiter") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function qualityBadge(post: HiringPost) {
  if (post.matchStatus === "review") {
    return { label: "Verify", className: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" };
  }
  if (post.score >= 85) {
    return { label: "Strong", className: "border-sky-200 bg-sky-50 text-sky-800", dot: "bg-sky-500" };
  }
  if (post.score >= 70) {
    return { label: "Good", className: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" };
  }
  return { label: "Worth a look", className: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" };
}

function firstName(value: string) {
  return value.trim().split(/[\s,]+/u)[0] || "them";
}

function EmptyState({ view, audience }: { view: InboxView; audience: SignalAudience }) {
  const copy: Record<InboxView, [string, string]> = {
    queue: ["Inbox cleared", "There are no unhandled high-confidence leads in this view."],
    review: ["Nothing useful to verify", "Only strong hiring signals with missing role or location details appear here."],
    contacted: ["No contacted leads yet", "After you send a message, mark the lead contacted and it will appear here."],
    hidden: ["No hidden leads", "Leads you intentionally hide can be restored from here."],
  };
  const audienceSuffix = audience === "technical"
    ? " Technical signals are highlighted when they arrive."
    : audience === "non-technical"
      ? " Business signals are highlighted when they arrive."
      : "";
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
        <Icon name="check" className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-xl font-bold text-slate-950">{copy[view][0]}</h2>
      <p className="mx-auto mt-2 max-w-xl text-base leading-7 text-slate-600">{copy[view][1]}{audienceSuffix}</p>
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
      className={`shrink-0 rounded-full object-cover ring-2 ring-white ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={imageUrl}
    />
  );
}

type MatchedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string | null;
  absoluteUrl: string;
  badgeLabel: string;
};

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
  const [audience, setAudience] = useState<SignalAudience>("all");
  const [company, setCompany] = useState("all");
  const [contactType, setContactType] = useState<ContactType | "all">("all");
  const [age, setAge] = useState<AgeFilter>("7d");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matchedJobs, setMatchedJobs] = useState<MatchedJob[] | null>(null);
  const [matchedLoading, setMatchedLoading] = useState(false);
  const { decisions, setDecision } = useLeadDecisions();
  const renderedAtTimestamp = Date.parse(renderedAt);

  const companies = useMemo(() => [...new Set(
    posts.filter((post) => post.company !== "Unknown").map((post) => post.company),
  )].sort((left, right) => left.localeCompare(right)), [posts]);

  const counts = useMemo(() => {
    const byAudience = (post: HiringPost) =>
      audience === "all" || (audience === "technical") === (post.roleFamily === "Technical");
    return {
      queue: posts.filter((post) => byAudience(post) && post.matchStatus === "match" && !decisions[post.id]).length,
      review: posts.filter((post) => byAudience(post) && post.matchStatus === "review" && !decisions[post.id]).length,
      contacted: posts.filter((post) => byAudience(post) && decisions[post.id] === "contacted").length,
      hidden: posts.filter((post) => byAudience(post) && decisions[post.id] === "hidden").length,
      direct: posts.filter((post) => post.matchStatus === "match" && post.contactType === "direct-team").length,
      recruiters: posts.filter((post) => post.matchStatus === "match" && post.contactType === "recruiter").length,
      excluded: posts.filter((post) => post.matchStatus === "excluded").length,
      technical: posts.filter((post) => post.roleFamily === "Technical").length,
    };
  }, [audience, decisions, posts]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return posts.filter((post) => {
      const decision = decisions[post.id];
      const viewMatches = view === "queue"
        ? post.matchStatus === "match" && !decision
        : view === "review"
          ? post.matchStatus === "review" && !decision
          : decision === view;
      const audienceMatches = audience === "all"
        || (audience === "technical") === (post.roleFamily === "Technical");
      const elapsed = renderedAtTimestamp - Date.parse(post.postedAt);
      const ageMatches = elapsed >= -5 * 60 * 1000 && elapsed <= ageMilliseconds[age];
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
        && (company === "all" || post.company === company)
        && (contactType === "all" || post.contactType === contactType)
        && ageMatches
        && textMatches;
    });
  }, [age, audience, company, contactType, decisions, posts, query, renderedAtTimestamp, view]);

  // Look up the selection in the full post list (not the filtered view) so
  // the panel stays open after an action moves the post out of the current view.
  const selectedPost = selectedId ? posts.find((post) => post.id === selectedId) ?? null : null;

  useEffect(() => {
    const postId = selectedPost?.id;
    const frame = requestAnimationFrame(() => {
      setMatchedJobs(null);
      setMatchedLoading(true);
    });
    if (!postId) return () => cancelAnimationFrame(frame);
    let cancelled = false;
    const keywords = (selectedPost.opportunityTitle ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .slice(0, 4)
      .join(" ");
    const params = new URLSearchParams({
      company: selectedPost.company,
      date: "all",
      tracks: "all",
      exp: "all",
      country: "all",
      limit: "3",
      ...(keywords ? { q: keywords } : {}),
    });
    fetch(`/api/jobs/search?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { jobs: MatchedJob[] }) => {
        if (!cancelled) setMatchedJobs(data.jobs ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatchedJobs([]);
      })
      .finally(() => {
        if (!cancelled) setMatchedLoading(false);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [selectedPost?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtersAreActive = audience !== "all" || company !== "all" || contactType !== "all" || age !== "7d" || query !== "";
  const viewOptions: Array<{ key: InboxView; label: string; count: number; hint: string; icon: "radar" | "search" | "check" | "x" }> = [
    { key: "queue", label: "To contact", count: counts.queue, hint: `${counts.direct} hiring team · ${counts.recruiters} recruiters`, icon: "radar" },
    { key: "review", label: "Verify manually", count: counts.review, hint: "Strong signal, missing detail", icon: "search" },
    { key: "contacted", label: "Contacted", count: counts.contacted, hint: "Saved on this browser", icon: "check" },
    { key: "hidden", label: "Hidden", count: counts.hidden, hint: "Restorable leads", icon: "x" },
  ];

  function markContacted(post: HiringPost) {
    setDecision(post.id, decisions[post.id] === "contacted" ? null : "contacted");
  }

  function markHidden(post: HiringPost) {
    setDecision(post.id, decisions[post.id] === "hidden" ? null : "hidden");
  }

  return (
    <>
      {!configured ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          <p className="font-bold">Development preview</p>
          <p>{source === "development-fixture" ? "Showing the local Apify export." : "Configure Apify and ingest the first run."}</p>
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-900" role="alert">
          Live feed error: {error}
        </div>
      ) : null}

      {/* Audience toggle */}
      <section aria-label="Signal audience" className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:w-auto" role="group">
          {([
            ["all", "All signals"],
            ["technical", "Technical"],
            ["non-technical", "Non-technical"],
          ] as const).map(([value, label]) => (
            <button
              aria-pressed={audience === value}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-bold transition-colors sm:flex-none sm:px-4 ${
                audience === value
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              key={value}
              onClick={() => setAudience(value)}
              type="button"
            >
              <Icon name={value === "technical" ? "code" : value === "non-technical" ? "users" : "layers"} className="h-4 w-4" />
              {label}
              {value === "all" ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${audience === "all" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>{posts.length}</span> : null}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-slate-500">
          {counts.technical} technical signals in the feed
          <span className="mx-1.5 text-slate-300">·</span>
          Technical and business roles use separate search queries.
        </p>
      </section>

      <section aria-label="Outreach inbox views" className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
        {viewOptions.map((option) => (
          <button
            aria-pressed={view === option.key}
            className={`min-h-24 border-b border-slate-200 p-4 text-left transition-colors duration-200 sm:border-r lg:border-b-0 ${view === option.key ? "bg-sky-700 text-white" : "bg-white text-slate-950 hover:bg-slate-50"}`}
            key={option.key}
            onClick={() => { setView(option.key); setSelectedId(null); }}
            type="button"
          >
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className={`block text-xs font-bold uppercase tracking-[0.14em] ${view === option.key ? "text-sky-100" : "text-slate-500"}`}>{option.label}</span>
                <span className="mt-1 block text-3xl font-bold tracking-[-0.05em]">{option.count}</span>
              </span>
              <Icon name={option.icon} className={`h-5 w-5 ${view === option.key ? "text-sky-100" : "text-slate-400"}`} />
            </span>
            <span className={`mt-1.5 block truncate text-xs ${view === option.key ? "text-sky-50" : "text-slate-500"}`}>{option.hint}</span>
          </button>
        ))}
      </section>

      <section aria-label="Filter outreach leads" className="card mt-5 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(150px,auto))]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Search leads</span>
            <span className="relative block">
              <Icon name="search" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
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
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Company</span>
            <select className="input h-11 font-semibold" onChange={(event) => setCompany(event.target.value)} value={company}>
              <option value="all">All companies</option>
              {companies.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Contact</span>
            <select className="input h-11 font-semibold" onChange={(event) => setContactType(event.target.value as typeof contactType)} value={contactType}>
              <option value="all">All contacts</option>
              <option value="direct-team">Hiring team</option>
              <option value="recruiter">Recruiters</option>
              <option value="employee-share">Employee shares</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Published</span>
            <select className="input h-11 font-semibold" onChange={(event) => setAge(event.target.value as AgeFilter)} value={age}>
              <option value="24h">Last 24 hours</option>
              <option value="3d">Last 3 days</option>
              <option value="7d">Last 7 days</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600" aria-live="polite">
          <p><span className="font-bold text-slate-900">{filtered.length}</span> visible · New batch every {scanCadenceHours}h · All {trackedCompanyCount} companies every {companyCycleHours}h</p>
          <div className="flex items-center gap-3">
            {filtersAreActive ? (
              <button className="min-h-11 font-bold text-sky-800 underline decoration-sky-300 underline-offset-4" onClick={() => { setAudience("all"); setCompany("all"); setContactType("all"); setAge("7d"); setQuery(""); }} type="button">Clear filters</button>
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

      {filtered.length === 0 ? (
        <div className="mt-5"><EmptyState view={view} audience={audience} /></div>
      ) : (
        <section className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,480px)]" aria-label={`${viewOptions.find((option) => option.key === view)?.label ?? "Outreach"} leads`}>
          {/* Compact table */}
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[minmax(210px,1fr)_minmax(170px,0.9fr)_minmax(100px,0.55fr)_minmax(100px,0.55fr)_110px_80px_96px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 xl:grid">
              <span>Author</span>
              <span>Post / Role</span>
              <span>Company</span>
              <span>Location</span>
              <span>Quality</span>
              <span className="text-right">Posted</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map((post) => {
                const decision = decisions[post.id];
                const selected = selectedId === post.id;
                const quality = qualityBadge(post);
                const isTechnical = post.roleFamily === "Technical";
                return (
                  <div
                    className={`relative transition-colors duration-150 ${selected ? "bg-sky-50/70" : "hover:bg-slate-50"}`}
                    key={post.id}
                  >
                    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-0.5 bg-sky-600 transition-opacity ${selected ? "opacity-100" : "opacity-0"}`} />
                    <button
                      aria-pressed={selected}
                      className="grid w-full grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left xl:grid-cols-[minmax(210px,1fr)_minmax(170px,0.9fr)_minmax(100px,0.55fr)_minmax(100px,0.55fr)_110px_80px_96px]"
                      onClick={() => setSelectedId(selected ? null : post.id)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AuthorPhoto name={post.author.name} imageUrl={post.author.imageUrl} className="h-10 w-10" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-bold text-slate-950">{post.author.name}</span>
                            {isTechnical ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-800">
                                <Icon name="code" className="h-2.5 w-2.5" /> Tech
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{post.author.headline || post.roleFamily}</span>
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-slate-900">{post.opportunityTitle}</span>
                          <span className={`hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold sm:inline ${contactBadgeClass(post.contactType)}`}>{contactLabels[post.contactType]}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{post.content.slice(0, 170) || "Link-only post"}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                        <CompanyLogo company={post.company} size="sm" decorative className="!h-4 !w-4 !rounded !text-[8px]" />
                        <span className="truncate">{post.company}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[12px] text-slate-600">
                        <Icon name="map-pin" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{post.location.label}</span>
                      </span>
                      <span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${quality.className}`}>
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${quality.dot}`} />
                          {quality.label}
                        </span>
                      </span>
                      <span className="text-right text-[11px] font-semibold text-slate-500">
                        {relativeAge(post.postedAt, renderedAtTimestamp).replace(" ago", "")}
                      </span>
                    </button>
                    <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 xl:flex">
                      <QuickActions post={post} decision={decision} onContacted={() => markContacted(post)} onHidden={() => markHidden(post)} compact />
                    </div>
                    <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-4 py-2 xl:hidden">
                      <QuickActions post={post} decision={decision} onContacted={() => markContacted(post)} onHidden={() => markHidden(post)} compact />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail side panel */}
          <aside className="card min-w-0 overflow-hidden xl:sticky xl:top-24" aria-live="polite">
            {selectedPost ? (
              <DetailPanel
                post={selectedPost}
                decision={decisions[selectedPost.id]}
                matchedJobs={matchedJobs}
                matchedLoading={matchedLoading}
                renderedAtTimestamp={renderedAtTimestamp}
                onContacted={() => markContacted(selectedPost)}
                onHidden={() => markHidden(selectedPost)}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Icon name="eye" className="h-6 w-6" />
                </span>
                <p className="max-w-[240px] text-sm leading-6 text-slate-500">
                  Select a lead to read the full post, see the author, and find its matched job opening.
                </p>
              </div>
            )}
          </aside>
        </section>
      )}

      <p className="mt-6 text-center text-xs leading-5 text-slate-500">
        {counts.excluded} low-signal or out-of-scope posts were archived automatically. Contacted and hidden states are private to this browser.
      </p>
    </>
  );
}

function QuickActions({
  post,
  decision,
  onContacted,
  onHidden,
  compact = false,
}: {
  post: HiringPost;
  decision: LeadDecision | undefined;
  onContacted: () => void;
  onHidden: () => void;
  compact?: boolean;
}) {
  const profileUrl = post.author.linkedinUrl ?? post.linkedinUrl;
  return (
    <span className={compact ? "inline-flex items-center gap-1" : "mt-4 grid gap-2"}>
      <a
        aria-label={`Open ${post.author.name}'s profile`}
        className={compact ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-sky-300 hover:text-sky-800" : "btn btn-secondary w-full"}
        href={profileUrl}
        rel="noreferrer"
        target="_blank"
      >
        <Icon name="external-link" className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </a>
      <button
        aria-pressed={decision === "contacted"}
        className={compact
          ? `inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${decision === "contacted" ? "border-sky-300 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-500 hover:border-sky-300 hover:text-sky-800"}`
          : `btn w-full ${decision === "contacted" ? "btn-primary" : "btn-secondary"}`}
        onClick={onContacted}
        title={decision === "contacted" ? "Mark as not contacted" : "Mark as contacted"}
        type="button"
      >
        <Icon name="check" className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {compact ? null : decision === "contacted" ? "Contacted" : "Mark contacted"}
      </button>
      <button
        aria-pressed={decision === "hidden"}
        className={compact
          ? `inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${decision === "hidden" ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-500 hover:border-rose-300 hover:text-rose-700"}`
          : `btn w-full ${decision === "hidden" ? "btn-secondary" : "btn-ghost"}`}
        onClick={onHidden}
        title={decision === "hidden" ? "Restore lead" : "Hide this lead"}
        type="button"
      >
        <Icon name="x" className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {compact ? null : decision === "hidden" ? "Restore" : "Hide"}
      </button>
    </span>
  );
}

function DetailPanel({
  post,
  decision,
  matchedJobs,
  matchedLoading,
  renderedAtTimestamp,
  onContacted,
  onHidden,
  onClose,
}: {
  post: HiringPost;
  decision: LeadDecision | undefined;
  matchedJobs: MatchedJob[] | null;
  matchedLoading: boolean;
  renderedAtTimestamp: number;
  onContacted: () => void;
  onHidden: () => void;
  onClose: () => void;
}) {
  const profileUrl = post.author.linkedinUrl ?? post.linkedinUrl;
  const why = post.matchStatus === "review"
    ? [...post.reasons, ...post.exclusionReasons]
    : post.reasons;
  const quality = qualityBadge(post);
  const isTechnical = post.roleFamily === "Technical";
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${contactBadgeClass(post.contactType)}`}>{contactLabels[post.contactType]}</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${quality.className}`}>
            <span aria-hidden="true" className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${quality.dot}`} />
            {quality.label}
          </span>
          {isTechnical ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">
              <Icon name="code" className="h-3 w-3" /> Technical
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Copy post text"
            className="btn btn-ghost !min-h-9 !px-2.5"
            onClick={copyPostText}
            title="Copy post text"
            type="button"
          >
            <Icon name={copied ? "check" : "upload"} className="h-4 w-4" />
          </button>
          <button aria-label="Close details" className="btn btn-ghost !min-h-9 !px-2.5" onClick={onClose} type="button">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <AuthorPhoto name={post.author.name} imageUrl={post.author.imageUrl} className="h-14 w-14" />
        <div className="min-w-0">
          <p className="text-base font-bold leading-6 text-slate-950">{post.author.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-600">{post.author.headline || "LinkedIn author"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
              <CompanyLogo company={post.company} size="sm" decorative className="!h-4 !w-4 !rounded !text-[8px]" />
              {post.company}
            </span>
            <span className="inline-flex items-center gap-1"><Icon name="map-pin" className="h-3 w-3" />{post.location.label}</span>
            <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3 w-3" />{relativeAge(post.postedAt, renderedAtTimestamp)}</span>
          </div>
        </div>
      </div>

      <h2 className="mt-5 text-lg font-bold tracking-[-0.02em] text-slate-950">{post.opportunityTitle}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-800">{post.roleFamily}</span>
        {decision === "contacted" ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">Contacted</span> : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 border-l-4 border-l-sky-300 bg-white">
        <p className="whitespace-pre-line break-words px-4 py-4 text-[15px] leading-7 text-slate-800 sm:px-5">
          {post.content || "Link-only post. The role details were recovered from its LinkedIn job card."}
        </p>
        {postLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Links in post</span>
            {postLinks.map((url) => (
              <a
                className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
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

      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Recommended action</p>
        <p className="mt-1.5 text-xs leading-5 text-slate-700">
          {post.matchStatus === "review"
            ? "Confirm the location and role details before messaging."
            : `Open ${firstName(post.author.name)}’s profile, mention this post, and ask one focused question.`}
        </p>
      </div>

      <a className="btn btn-primary mt-4 w-full" href={profileUrl} rel="noreferrer" target="_blank">
        Open profile to message <Icon name="external-link" className="h-4 w-4" />
      </a>
      <QuickActions post={post} decision={decision} onContacted={onContacted} onHidden={onHidden} />

      {/* Matched job opening */}
      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Matched job opening</p>
        {matchedLoading ? (
          <div className="mt-2 space-y-2">
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : matchedJobs && matchedJobs.length > 0 ? (
          <div className="mt-2 space-y-2">
            {matchedJobs.map((job) => (
              <a
                className="block rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-sky-300 hover:bg-sky-50"
                href={job.absoluteUrl}
                key={job.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="block text-[13px] font-bold leading-5 text-slate-950">{job.title}</span>
                  <Icon name="arrow-up-right" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" />
                </span>
                <span className="mt-1 block truncate text-[11px] text-slate-500">{job.company} · {job.location}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{job.badgeLabel}</span>
                  <span>{job.postedAt ? relativeAge(job.postedAt, renderedAtTimestamp) : "date unknown"}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-dashed border-slate-300 p-3 text-xs leading-5 text-slate-500">
            No matching opening found in the job index.
            {post.opportunityUrl ? (
              <a className="mt-1 block font-bold text-sky-700 hover:underline" href={post.opportunityUrl} rel="noreferrer" target="_blank">
                Open the linked job posting <Icon name="external-link" className="inline h-3 w-3" />
              </a>
            ) : null}
          </div>
        )}
      </div>

      {why.length > 0 ? (
        <details className="mt-5 border-t border-slate-200 pt-4">
          <summary className="min-h-9 cursor-pointer text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Why it surfaced</summary>
          <ul className="space-y-2 pb-1 pt-2">
            {why.slice(0, 6).map((reason) => (
              <li className="flex gap-2 text-xs leading-5 text-slate-700" key={reason}>
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
