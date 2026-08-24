import {
  classifyContactType,
  classifyRoleFamily,
  hasHiringIntent,
  inferCompany,
  inferLocation,
  isNonHiringNoise,
} from "./classification";
import { isKnownHiringUrl } from "./targets";
import type {
  ApifyLinkedinPost,
  HiringPost,
  JobLinkMetadata,
} from "./types";

function compact(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function extractUrls(text: string) {
  return [...text.matchAll(/https?:\/\/[^\s<>"']+/giu)]
    .map((match) => match[0].replace(/[),.;!?]+$/gu, ""));
}

function canonicalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (parameter.startsWith("utm_") || parameter === "trk") {
        url.searchParams.delete(parameter);
      }
    }
    if (url.hostname === "amazon.jobs" || url.hostname.endsWith(".amazon.jobs")) {
      url.protocol = "https:";
    }
    return url.toString().replace(/\/$/u, "");
  } catch {
    return value;
  }
}

function resolvePostedAt(raw: ApifyLinkedinPost) {
  const date = raw.postedAt?.date;
  if (date && !Number.isNaN(Date.parse(date))) return new Date(date).toISOString();

  const timestamp = raw.postedAt?.timestamp;
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

function fallbackTitle(content: string) {
  const firstLine = content.split(/\r?\n/u).map(compact).find(Boolean) ?? "";
  return firstLine.slice(0, 180) || "Role mentioned in LinkedIn post";
}

export function normalizeHiringPost(
  raw: ApifyLinkedinPost,
  now = new Date(),
  metadata: JobLinkMetadata = { title: null, locations: [] },
): HiringPost | null {
  const id = compact(raw.id);
  const linkedinUrl = compact(raw.linkedinUrl);
  const postedAt = resolvePostedAt(raw);
  if (!id || !linkedinUrl || !postedAt) return null;

  const content = compact(raw.content);
  const articleTitle = compact(raw.article?.title);
  const articleDescription = compact(raw.article?.description);
  const articleUrl = compact(raw.article?.link);
  const sourceUrls = [...new Set([
    articleUrl,
    ...extractUrls(content),
  ].filter(Boolean).map(canonicalizeUrl))];
  const opportunityUrl = sourceUrls.find(isKnownHiringUrl) ?? sourceUrls.find((value) => {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return hostname === "lnkd.in";
    } catch {
      return false;
    }
  }) ?? (articleUrl ? canonicalizeUrl(articleUrl) : null);

  const authorName = compact(raw.author?.name) || "Unknown author";
  const authorHeadline = compact(raw.author?.info);
  // compact() returns "" for a missing field, so the chain must fall through
  // on empty strings (||), not only null/undefined (??).
  const authorImageUrl = compact(raw.author?.avatar?.url)
    || compact(raw.author?.imageUrl)
    || compact(raw.author?.pictureUrl)
    || compact(raw.author?.profilePicture)
    || null;
  const locationText = [
    raw.content ?? "",
    articleTitle,
    articleDescription,
  ].filter(Boolean).join("\n");
  const searchableText = compact([
    content,
    articleTitle,
    articleDescription,
    compact(raw.header?.text),
    authorHeadline,
  ].filter(Boolean).join(" "));
  const opportunityTitle = metadata.title || articleTitle || fallbackTitle(raw.content ?? "");
  const company = inferCompany(authorHeadline, searchableText, sourceUrls);
  const contactType = classifyContactType(content, authorHeadline);
  const roleFamily = classifyRoleFamily(opportunityTitle, searchableText);
  const location = inferLocation(locationText, metadata.locations);
  const exclusionReasons: string[] = [];
  const reasons: string[] = [];
  const nonHiringNoise = isNonHiringNoise(searchableText);
  const hiringIntent = hasHiringIntent(searchableText);

  if (company === "Unknown") exclusionReasons.push("Current target-company affiliation is not verified");
  else reasons.push(`${company} signal verified`);

  if (nonHiringNoise || (!hiringIntent && !opportunityUrl)) {
    exclusionReasons.push("The post is not advertising a concrete open role");
  }
  if (roleFamily === "Other") reasons.push("Role family needs verification");
  else reasons.push(`${roleFamily} role`);

  if (location.status === "outside-us") exclusionReasons.push("Role is outside the United States");
  else if (location.status === "us") reasons.push("US location verified");
  else reasons.push("Location needs manual verification");

  if (contactType === "direct-team") reasons.push("Author says the role is on their team");
  else if (contactType === "recruiter") reasons.push("Recruiter contact");
  else reasons.push("Employee share");

  if (opportunityUrl) reasons.push("Job or application link available");
  if (!content && opportunityUrl) reasons.push("Link-only post recovered from its job card");

  let matchStatus: HiringPost["matchStatus"] = "match";
  if (exclusionReasons.length > 0) matchStatus = "excluded";
  else if (roleFamily === "Other") {
    // An unverified location is not grounds for dropping a lead: most posts
    // never state one, the label already says it needs checking, and the U.S.
    // region filter keeps "unknown" visible anyway. Only a post whose role
    // could not be identified at all still needs a hiring owner to be worth
    // surfacing.
    const isHighIntentContact = contactType === "direct-team" || contactType === "recruiter";
    if (isHighIntentContact) {
      matchStatus = "review";
    } else {
      matchStatus = "excluded";
      exclusionReasons.push("No actionable hiring owner or role was identified");
    }
  } else if (location.status === "unknown") {
    matchStatus = "review";
  }

  let score = 0;
  score += contactType === "direct-team" ? 35 : contactType === "recruiter" ? 25 : 10;
  score += company === "Unknown" ? 0 : 15;
  score += opportunityUrl ? 10 : 0;
  score += location.status === "us" ? 15 : location.status === "unknown" ? 5 : 0;
  score += roleFamily === "Technical" ? 0 : roleFamily === "Other" ? 3 : 15;
  score += hiringIntent ? 10 : 0;
  score = Math.max(0, Math.min(100, score));

  const seenAt = now.toISOString();
  return {
    id,
    sourcePostIds: [id],
    linkedinUrl,
    company,
    author: {
      name: authorName,
      headline: authorHeadline,
      linkedinUrl: compact(raw.author?.linkedinUrl) || null,
      imageUrl: authorImageUrl,
    },
    contactType,
    content,
    postedAt,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    opportunityTitle,
    opportunityUrl,
    sourceUrls,
    location,
    roleFamily,
    matchStatus,
    score,
    reasons,
    exclusionReasons,
  };
}

export function normalizeHiringPosts(
  rawPosts: ApifyLinkedinPost[],
  now = new Date(),
  metadataByUrl = new Map<string, JobLinkMetadata>(),
) {
  return rawPosts.flatMap((raw) => {
    const articleUrl = compact(raw.article?.link);
    const metadata = metadataByUrl.get(articleUrl)
      ?? metadataByUrl.get(canonicalizeUrl(articleUrl))
      ?? { title: null, locations: [] };
    const normalized = normalizeHiringPost(raw, now, metadata);
    return normalized ? [normalized] : [];
  });
}

export function reclassifyHiringPost(post: HiringPost) {
  const normalized = normalizeHiringPost({
    id: post.id,
    linkedinUrl: post.linkedinUrl,
    content: post.content,
    author: {
      name: post.author.name,
      info: post.author.headline,
      linkedinUrl: post.author.linkedinUrl,
      imageUrl: post.author.imageUrl,
    },
    postedAt: { date: post.postedAt },
    article: {
      title: post.opportunityTitle,
      link: post.opportunityUrl,
    },
  }, new Date(post.lastSeenAt), {
    title: post.opportunityTitle,
    locations: post.location.confidence === "structured" ? [post.location.label] : [],
  });

  return normalized ? {
    ...normalized,
    sourcePostIds: post.sourcePostIds,
    firstSeenAt: post.firstSeenAt,
    lastSeenAt: post.lastSeenAt,
  } : post;
}

export function normalizedContentBody(post: HiringPost) {
  return post.content
    .normalize("NFKD")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

export function normalizedContentFingerprint(post: HiringPost) {
  return `${post.author.linkedinUrl ?? post.author.name.toLowerCase()}::${normalizedContentBody(post)}`;
}
