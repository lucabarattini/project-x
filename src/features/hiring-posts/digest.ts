import type { ContactType } from "./types";

/**
 * Automated job digests, and how to tell them from an opening.
 *
 * A hiring signal is worth reading when a named person owns the role. A few
 * accounts instead publish a daily link dump — "🚀 Amazon is Hiring! | August
 * 29, 2026 (Part 5/5)", eight unrelated roles at a company that is not their
 * employer, "🔔 Follow for daily Amazon job updates" — and because every
 * instalment is a distinct post with a distinct URL, none of the existing
 * deduplication touches them. One such account held 8 of the 34 results in a
 * sampled run and 10 of the stored feed.
 *
 * The test is the post's shape, not its author. There is no name list here on
 * purpose: a blocklist stops working the moment the next account starts
 * posting, and it keeps punishing an author who writes a real post tomorrow.
 * Two shapes are enough:
 *
 * 1. The post advertises many distinct roles at once — a listing, not an
 *    opening. Counted from the template's own repetitions (💼 / 📍 / 🔗 per
 *    role) or, when there is no template, from distinct links.
 * 2. The post announces itself as one instalment of a series — "(Part 4/5)",
 *    a dated headline, "follow for daily job updates". Two roles beside such a
 *    marker settle it, because the shortest instalment of the daily series
 *    carries only two and dropping four parts while keeping the fifth is the
 *    worst of both outcomes.
 *
 * Shape 1 defers to one piece of counter-evidence: an author who says the
 * roles are on their own team. A Meta tech lead hiring "senior or staff level
 * Production Engineers / Network Engineers / Software Engineers" links seven
 * reqs and owns every one of them, and an OpenAI manager sharing five roles
 * next to her team is doing the thing this feed exists to surface. Shape 2
 * does not defer, because no genuine post is also part 4 of 5.
 *
 * Two signals were considered and left out. The same author appearing many
 * times in a short window is real evidence, but it needs cross-post context
 * that normalization does not have, and the per-post shapes already caught
 * every instance of it in the stored feed. Roles at a company other than the
 * author's employer is a good tell for exactly the accounts the shapes above
 * already catch, and it misfires on the employee who shares a partner's role.
 * Add either one when a digest gets through, not before.
 */

/**
 * One repetition per role. Digests use a fixed template — 💼 title, 📍 place,
 * 🔗 link — so whichever glyph the template repeats, the count is the number
 * of roles. Taking the maximum rather than the sum keeps a post that pairs 💼
 * with 📍 from scoring twice for one role.
 */
const roleBulletGlyphs = ["💼", "📍", "🔗", "👉", "👉🏼", "➡️", "▶️"];

/**
 * Three roles is where "here are the two openings on my team" ends and a
 * listing begins. In the stored feed only a couple of dozen posts of 1,239
 * reach it, and the genuine ones among those carry the ownership language
 * below.
 */
const manyRolesThreshold = 3;

/**
 * Links are the weaker count: a real post can carry the job link, the team
 * page and a scheduling link without listing an extra role. The threshold sits
 * above that, and is only ever reached by posts with no template at all.
 */
const manyLinksThreshold = 5;

/**
 * Above this, the shape is a listing whatever language surrounds it. No
 * genuine post in the stored feed lists more than five roles; the daily
 * digests run to eight or ten. This is the backstop against a digest that
 * sprinkles "my team" into its template to look owned.
 */
const undeniableRolesThreshold = 8;

/**
 * Markers that announce the post as one instalment of a recurring series.
 * These are the strongest evidence available: a post that says it is part 1
 * of 3, or invites you to follow for daily updates, is a publication.
 */
const serialDigestMarkers: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "a numbered instalment (Part N/M)",
    pattern: /\bpart\s*\d+\s*(?:\/|of)\s*\d+\b/iu,
  },
  {
    label: "a standing invitation to follow for daily updates",
    pattern: /\bfollow\s+(?:me\s+)?for\s+(?:more\s+)?daily\b|\bdaily\s+(?:job|hiring|career)\s+(?:updates?|digests?|alerts?|posts?)\b/iu,
  },
  {
    label: "a dated daily-digest headline",
    pattern: /\bis\s+hiring!?\s*[|\-–—]\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/iu,
  },
  {
    label: "a roles-posted-in-the-last-24-hours roundup",
    pattern: /\b(?:fresh|new|latest)\s+roles?\s+posted\s+in\s+the\s+last\s+\d+\s+hours?\b/iu,
  },
];

function countGlyph(text: string, glyph: string) {
  let count = 0;
  let index = text.indexOf(glyph);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(glyph, index + glyph.length);
  }
  return count;
}

function distinctLinkCount(text: string) {
  const urls = [...text.matchAll(/https?:\/\/[^\s<>"']+/giu)]
    .map((match) => match[0].replace(/[),.;!?]+$/gu, ""));
  return new Set(urls).size;
}

export function serialDigestSignals(title: string, content: string) {
  const text = `${title}\n${content}`;
  const roleBullets = Math.max(
    0,
    ...roleBulletGlyphs.map((glyph) => countGlyph(content, glyph)),
  );
  const distinctLinks = distinctLinkCount(content);
  return {
    roleBullets,
    distinctLinks,
    /**
     * Roles that each carry their own link, which is what a listing looks
     * like. Counting glyphs alone read an Amazon recruiter's single Program
     * Manager opening as five roles, because the post repeated 📍 once per
     * office the one role sits in — and it linked that one role once. A
     * digest's template emits a link per row, so the smaller of the two counts
     * is the honest one.
     */
    listedRoles: Math.min(roleBullets, distinctLinks),
    markers: serialDigestMarkers
      .filter(({ pattern }) => pattern.test(text))
      .map(({ label }) => label),
  };
}

/**
 * The reason to show on the post, or null when it reads as a real opening.
 *
 * A reason rather than a boolean, because the post stays in the feed as an
 * excluded record carrying the sentence that explains it. A wrong call is then
 * visible and arguable, instead of being a post that silently never arrived.
 */
export function serialDigestExclusionReason(
  title: string,
  content: string,
  contactType: ContactType,
): string | null {
  const { distinctLinks, listedRoles, markers } = serialDigestSignals(title, content);

  if (markers.length > 0 && (listedRoles >= 2 || distinctLinks >= 2)) {
    return `Automated job digest: the post carries ${markers[0]}`;
  }

  if (listedRoles >= undeniableRolesThreshold) {
    return `Automated job digest: ${listedRoles} roles listed in one post`;
  }

  // The author says the roles are on their own team, which is the one thing a
  // digest never says truthfully. Counting alone cannot tell a manager with
  // seven reqs from an aggregator with seven links, so it defers here.
  if (contactType === "direct-team") return null;

  if (listedRoles >= manyRolesThreshold) {
    return `Automated job digest: ${listedRoles} unrelated roles listed in one post`;
  }
  if (distinctLinks >= manyLinksThreshold) {
    return `Automated job digest: ${distinctLinks} job links in one post`;
  }

  return null;
}
