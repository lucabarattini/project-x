import assert from "node:assert/strict";
import test from "node:test";
import { emptyHiringPostFeed, mergeHiringPostFeed } from "./feed";
import { normalizeHiringPost } from "./normalize";
import type { ApifyLinkedinPost } from "./types";

const now = new Date("2026-08-14T22:00:00.000Z");

function rawPost(overrides: Partial<ApifyLinkedinPost> = {}): ApifyLinkedinPost {
  return {
    id: "post-1",
    linkedinUrl: "https://www.linkedin.com/posts/post-1",
    content: "My team is hiring a Senior Program Manager in Seattle, WA.",
    author: {
      name: "Hiring Leader",
      info: "Senior Manager at Amazon",
      linkedinUrl: "https://www.linkedin.com/in/hiring-leader",
    },
    postedAt: { date: "2026-08-14T20:00:00.000Z" },
    article: {
      title: "Senior Program Manager",
      subtitle: "amazon.jobs",
      link: "https://www.amazon.jobs/en/jobs/123/senior-program-manager",
    },
    ...overrides,
  };
}

test("keeps a direct imageUrl when the actor provides no avatar object", () => {
  const post = normalizeHiringPost(rawPost({
    author: {
      name: "Hiring Leader",
      info: "Senior Manager at Amazon",
      linkedinUrl: "https://www.linkedin.com/in/hiring-leader",
      imageUrl: "https://media.licdn.com/dms/image/profile-displayphoto-456/0/1",
    },
  }), now);
  assert.equal(post?.author.imageUrl, "https://media.licdn.com/dms/image/profile-displayphoto-456/0/1");
});

test("maps the author avatar url from the raw actor output", () => {
  const post = normalizeHiringPost(rawPost({
    author: {
      name: "Hiring Leader",
      info: "Senior Manager at Amazon",
      linkedinUrl: "https://www.linkedin.com/in/hiring-leader",
      avatar: {
        url: "https://media.licdn.com/dms/image/profile-displayphoto-123/0/1",
        width: 400,
        height: 400,
      },
    },
  }), now);
  assert.equal(post?.author.imageUrl, "https://media.licdn.com/dms/image/profile-displayphoto-123/0/1");
});

test("keeps a direct-team, non-technical US post as a match", () => {
  const post = normalizeHiringPost(rawPost(), now);
  assert.ok(post);
  assert.equal(post.company, "Amazon");
  assert.equal(post.contactType, "direct-team");
  assert.equal(post.location.status, "us");
  assert.equal(post.roleFamily, "Product, Program & Project");
  assert.equal(post.matchStatus, "match");
  assert.equal(post.score, 100);
});

test("keeps recruiters as useful contacts", () => {
  const post = normalizeHiringPost(rawPost({
    content: "We're hiring a Risk Manager in New York, NY. Reach out to learn more.",
    author: {
      name: "Recruiter",
      info: "Recruiter II at Amazon",
      linkedinUrl: "https://www.linkedin.com/in/recruiter",
    },
    article: {
      title: "Risk Manager",
      subtitle: "amazon.jobs",
      link: "https://www.amazon.jobs/en/jobs/456/risk-manager",
    },
  }), now);
  assert.ok(post);
  assert.equal(post.contactType, "recruiter");
  assert.equal(post.matchStatus, "match");
  assert.ok(post.score > 0);
});

test("excludes a non-US role without hard-coding an author or job", () => {
  const post = normalizeHiringPost(rawPost({
    content: "I'm hiring a Studios Strategy Analyst in Tokyo, Japan.",
    author: {
      name: "Studio Leader",
      info: "Head of Strategy at Amazon Studios",
      linkedinUrl: "https://www.linkedin.com/in/studio-leader",
    },
    article: null,
  }), now);
  assert.ok(post);
  assert.equal(post.location.status, "outside-us");
  assert.equal(post.matchStatus, "excluded");
  assert.ok(post.exclusionReasons.includes("Role is outside the United States"));
});

test("uses the explicit role location instead of countries mentioned in the description", () => {
  const post = normalizeHiringPost(rawPost({
    content: [
      "We're hiring a Procurement Program Manager.",
      "The team supports APAC, Europe, and the United States.",
      "📍 Location: Hyderabad, India",
    ].join("\n"),
    article: {
      title: "Procurement Program Manager",
      subtitle: "amazon.jobs",
      link: "https://www.amazon.jobs/en/jobs/789/procurement-program-manager",
    },
  }), now);
  assert.ok(post);
  assert.equal(post.location.label, "Hyderabad, India");
  assert.equal(post.location.status, "outside-us");
  assert.equal(post.matchStatus, "excluded");
});

test("recovers a link-only post from article metadata", () => {
  const post = normalizeHiringPost(rawPost({
    content: "",
    author: {
      name: "Google Leader",
      info: "Product Strategy at Google",
      linkedinUrl: "https://www.linkedin.com/in/google-leader",
    },
    article: {
      title: "Strategy and Operations Lead",
      subtitle: "google.com",
      link: "https://www.google.com/about/careers/applications/jobs/results/123-strategy-operations-lead",
    },
  }), now, {
    title: "Strategy and Operations Lead",
    locations: ["New York, NY, United States"],
  });
  assert.ok(post);
  assert.equal(post.company, "Google");
  assert.equal(post.content, "");
  assert.equal(post.location.confidence, "structured");
  assert.equal(post.matchStatus, "match");
  assert.ok(post.reasons.includes("Link-only post recovered from its job card"));
});

test("filters self-promotional job-seeking posts", () => {
  const post = normalizeHiringPost(rawPost({
    content: "I am actively looking for my next opportunity in Seattle, WA.",
    article: null,
  }), now);
  assert.ok(post);
  assert.equal(post.matchStatus, "excluded");
  assert.ok(post.exclusionReasons.includes("The post is not advertising a concrete open role"));
});

test("matches target companies case-insensitively and across stylized Unicode", () => {
  const amazon = normalizeHiringPost(rawPost({
    author: {
      name: "Leader",
      info: "Director at aMaZoN",
      linkedinUrl: null,
    },
    article: null,
  }), now);
  const google = normalizeHiringPost(rawPost({
    id: "post-google",
    linkedinUrl: "https://linkedin.com/posts/google",
    author: {
      name: "Leader",
      info: "Strategy Lead at 𝙂𝙊𝙊𝙂𝙇𝙀",
      linkedinUrl: null,
    },
    article: null,
  }), now);
  assert.equal(amazon?.company, "Amazon");
  assert.equal(google?.company, "Google");
});

test("does not treat a former employer as current affiliation", () => {
  const post = normalizeHiringPost(rawPost({
    content: "My team is hiring a Program Manager in Seattle, WA.",
    author: {
      name: "Former employee",
      info: "Director at Startup | ex-GOOGLE",
      linkedinUrl: null,
    },
    article: null,
  }), now);
  assert.equal(post?.company, "Unknown");
  assert.equal(post?.matchStatus, "excluded");
});

test("keeps high-intent unknown-location posts in review and archives vague employee shares", () => {
  const direct = normalizeHiringPost(rawPost({
    content: "My team is hiring a Finance Manager. Apply here.",
    article: null,
  }), now);
  const vague = normalizeHiringPost(rawPost({
    id: "post-vague",
    linkedinUrl: "https://linkedin.com/posts/vague",
    content: "Hiring is changing quickly. Here are some thoughts about leadership.",
    author: {
      name: "Employee",
      info: "Program Manager at Amazon",
      linkedinUrl: "https://linkedin.com/in/employee",
    },
    article: null,
  }), now);
  assert.equal(direct?.matchStatus, "review");
  assert.equal(vague?.matchStatus, "excluded");
});

test("classifies common non-engineering recruiter roles instead of sending them to review", () => {
  const post = normalizeHiringPost(rawPost({
    content: "We're hiring a Senior Account Executive in Seattle, WA. Apply now.",
    author: {
      name: "Recruiter",
      info: "Talent Partner at Amazon",
      linkedinUrl: "https://linkedin.com/in/recruiter",
    },
    article: {
      title: "Senior Account Executive",
      link: "https://www.amazon.jobs/en/jobs/999/senior-account-executive",
    },
  }), now);
  assert.equal(post?.roleFamily, "Sales & Partnerships");
  assert.equal(post?.matchStatus, "match");
  assert.ok((post?.score ?? 101) <= 100);
});

test("deduplicates repeated posts and removes records older than seven days", () => {
  const first = normalizeHiringPost(rawPost(), now);
  const duplicate = normalizeHiringPost(rawPost({ id: "post-2" }), now);
  const old = normalizeHiringPost(rawPost({
    id: "post-old",
    linkedinUrl: "https://www.linkedin.com/posts/post-old",
    content: "My team is hiring a Finance Manager in Seattle, WA.",
    postedAt: { date: "2026-08-06T20:00:00.000Z" },
  }), now);
  assert.ok(first && duplicate && old);

  const feed = mergeHiringPostFeed(emptyHiringPostFeed(), [first, duplicate, old], {
    runId: "run-1",
    rawCount: 3,
    now,
  });
  assert.equal(feed.posts.length, 1);
  assert.deepEqual(new Set(feed.posts[0].sourcePostIds), new Set(["post-1", "post-2"]));

  const repeated = mergeHiringPostFeed(feed, [first], {
    runId: "run-1",
    rawCount: 1,
    now,
  });
  assert.equal(repeated, feed);
});

test("feed merge keeps an author photo when a re-ingested copy has none", () => {
  const withPhoto = normalizeHiringPost(rawPost({
    id: "photo-post",
    author: {
      name: "Hiring Leader",
      info: "Senior Manager at Amazon",
      linkedinUrl: "https://www.linkedin.com/in/hiring-leader",
      avatar: { url: "https://media.licdn.com/dms/image/profile-displayphoto-abc/0/1", width: 400, height: 400 },
    },
  }), now);
  const withoutPhoto = normalizeHiringPost(rawPost({
    id: "photo-post",
    author: {
      name: "Hiring Leader",
      info: "Senior Manager at Amazon",
      linkedinUrl: "https://www.linkedin.com/in/hiring-leader",
    },
  }), now);
  assert.ok(withPhoto && withoutPhoto);

  const first = mergeHiringPostFeed(emptyHiringPostFeed(), [withPhoto], { runId: "run-photo", rawCount: 1, now });
  const second = mergeHiringPostFeed(first, [withoutPhoto], { runId: "run-copy", rawCount: 1, now });
  assert.equal(second.posts[0].author.imageUrl, "https://media.licdn.com/dms/image/profile-displayphoto-abc/0/1");
});

test("collapses identical low-signal campaigns shared by different employees", () => {
  const campaign = "We're hiring early-career business roles across the company. Apply to one of the open positions and share this detailed campaign with your network.";
  const first = normalizeHiringPost(rawPost({
    content: campaign,
    author: { name: "Employee One", info: "Employee at Google", linkedinUrl: "https://linkedin.com/in/one" },
    article: null,
  }), now);
  const second = normalizeHiringPost(rawPost({
    id: "post-campaign-2",
    linkedinUrl: "https://linkedin.com/posts/campaign-2",
    content: campaign,
    author: { name: "Employee Two", info: "Employee at Google", linkedinUrl: "https://linkedin.com/in/two" },
    article: null,
  }), now);
  assert.ok(first && second);
  const feed = mergeHiringPostFeed(emptyHiringPostFeed(), [first, second], {
    runId: "campaign-run",
    rawCount: 2,
    now,
  });
  assert.equal(feed.posts.length, 1);
  assert.deepEqual(new Set(feed.posts[0].sourcePostIds), new Set(["post-1", "post-campaign-2"]));
});
