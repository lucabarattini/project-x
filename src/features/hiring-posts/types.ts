export type TargetCompany = string;

export type ContactType = "direct-team" | "recruiter" | "employee-share";

export type RoleFamily =
  | "Analytics & Strategy"
  | "Creative & Design"
  | "Finance"
  | "Legal, Policy & Risk"
  | "Marketing & Communications"
  | "Operations & Supply Chain"
  | "People & Recruiting"
  | "Product, Program & Project"
  | "Sales & Partnerships"
  | "Technical"
  | "Other";

export type LocationStatus = "us" | "outside-us" | "unknown";
export type MatchStatus = "match" | "review" | "excluded";

export type HiringPostAuthor = {
  name: string;
  headline: string;
  linkedinUrl: string | null;
  /** Public profile photo URL from the feed source, when available. */
  imageUrl: string | null;
};

export type HiringPostLocation = {
  label: string;
  status: LocationStatus;
  confidence: "structured" | "text" | "unknown";
};

export type HiringPost = {
  id: string;
  sourcePostIds: string[];
  linkedinUrl: string;
  company: TargetCompany;
  author: HiringPostAuthor;
  contactType: ContactType;
  content: string;
  postedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  opportunityTitle: string;
  opportunityUrl: string | null;
  sourceUrls: string[];
  location: HiringPostLocation;
  roleFamily: RoleFamily;
  matchStatus: MatchStatus;
  score: number;
  reasons: string[];
  exclusionReasons: string[];
  /**
   * True when the page payload carries metadata only and the full post text is
   * fetched on demand (see /api/hiring-posts/content). Keeps the initial HTML
   * small while the default view still renders full descriptions instantly.
   */
  contentOmitted?: boolean;
};

export type HiringPostFeed = {
  version: 1;
  updatedAt: string | null;
  lastRunId: string | null;
  ingestedRunIds: string[];
  rawItemsSeen: number;
  posts: HiringPost[];
};

export type ApifyLinkedinPost = {
  id?: string | null;
  linkedinUrl?: string | null;
  content?: string | null;
  author?: {
    name?: string | null;
    info?: string | null;
    linkedinUrl?: string | null;
    imageUrl?: string | null;
    pictureUrl?: string | null;
    profilePicture?: string | null;
    avatar?: {
      url?: string | null;
      width?: number | null;
      height?: number | null;
    } | null;
  } | null;
  postedAt?: {
    date?: string | null;
    timestamp?: number | null;
  } | null;
  article?: {
    title?: string | null;
    subtitle?: string | null;
    link?: string | null;
    description?: string | null;
  } | null;
  header?: {
    text?: string | null;
  } | null;
  query?: {
    search?: string | null;
    authorsCompany?: string[] | null;
  } | null;
};

export type JobLinkMetadata = {
  title: string | null;
  locations: string[];
};
