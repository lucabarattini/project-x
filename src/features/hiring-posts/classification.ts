import type {
  ContactType,
  HiringPostLocation,
  RoleFamily,
  TargetCompany,
} from "./types";
import {
  companyFromHiringUrl,
  companyMentionInText,
  withoutFormerCompanyMentions,
} from "./targets";

const usStateNames = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
];

const usStateCodes = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI",
  "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

const outsideUsNames = [
  "Argentina", "Australia", "Austria", "Belgium", "Brazil", "Canada",
  "Chile", "China", "Colombia", "Czechia", "Denmark", "Egypt", "Finland",
  "France", "Germany", "Greece", "Hong Kong", "Hungary", "India",
  "Indonesia", "Ireland", "Israel", "Italy", "Japan", "Malaysia", "Mexico",
  "Netherlands", "New Zealand", "Norway", "Philippines", "Poland", "Portugal",
  "Romania", "Saudi Arabia", "Singapore", "South Africa", "South Korea",
  "Spain", "Sweden", "Switzerland", "Taiwan", "Thailand", "Turkey",
  "United Arab Emirates", "United Kingdom", "Vietnam", "Europe", "EMEA",
  "APAC", "Middle East", "European Union", "Türkiye", "UK", "U.K.",
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const usStatePattern = new RegExp(`\\b(?:${usStateNames.map(escapeRegex).join("|")})\\b`, "iu");
const usStateCodePattern = new RegExp(`,\\s*(?:${usStateCodes.join("|")})\\b`, "u");
const outsideUsPattern = new RegExp(`\\b(?:${outsideUsNames.map(escapeRegex).join("|")})\\b`, "iu");

function locationStatus(text: string) {
  const hasUsSignal = /\b(?:United States|USA|U\.S\.A?\.)\b/iu.test(text)
    || usStatePattern.test(text)
    || usStateCodePattern.test(text);
  const hasOutsideSignal = outsideUsPattern.test(text.replace(/\bNew Mexico\b/giu, " "));

  if (hasUsSignal && hasOutsideSignal) return "unknown" as const;
  if (hasUsSignal) return "us" as const;
  if (hasOutsideSignal) return "outside-us" as const;
  return "unknown" as const;
}

function explicitLocationFragment(text: string) {
  const labeled = text.match(
    /(?:📍\s*(?:Open\s+)?Locations?\s*:?\s*|(?:Open\s+)?\bLocations?\s*:\s*)([^\r\n]{2,220})/iu,
  )?.[1]?.trim();
  if (labeled) return labeled;

  return text.match(/📍\s*([^\r\n]{2,220})/u)?.[1]?.trim() ?? null;
}

function locationLabel(text: string, status: HiringPostLocation["status"]) {
  const fragment = explicitLocationFragment(text);
  if (fragment) return fragment;

  const state = text.match(usStatePattern)?.[0];
  if (state) return state;

  const country = text.match(outsideUsPattern)?.[0];
  if (country) return country;

  return status === "us" ? "United States" : "Location not verified";
}

export function inferLocation(text: string, structuredLocations: string[] = []): HiringPostLocation {
  if (structuredLocations.length > 0) {
    const joined = structuredLocations.join(" · ");
    return {
      label: joined,
      status: locationStatus(joined),
      confidence: "structured",
    };
  }

  const explicitLocation = explicitLocationFragment(text);
  const locationText = explicitLocation ?? text;
  const status = locationStatus(locationText);
  return {
    label: explicitLocation ?? locationLabel(locationText, status),
    status,
    confidence: status === "unknown" ? "unknown" : "text",
  };
}

export function inferCompany(
  authorHeadline: string,
  text: string,
  urls: string[],
): TargetCompany {
  for (const value of urls) {
    const company = companyFromHiringUrl(value);
    if (company) return company;
  }

  const currentHeadline = withoutFormerCompanyMentions(authorHeadline);
  const headlineCompany = companyMentionInText(currentHeadline);
  if (headlineCompany) return headlineCompany;

  return companyMentionInText(withoutFormerCompanyMentions(text)) ?? "Unknown";
}

export function classifyContactType(content: string, authorHeadline: string): ContactType {
  if (/\b(?:recruiter|recruiting|talent acquisition|talent partner|sourcer)\b/iu.test(authorHeadline)) {
    return "recruiter";
  }
  if (/\b(?:my team|our team|join (?:my|our) team|I(?:'|’)?m hiring|I am hiring)\b/iu.test(content)) {
    return "direct-team";
  }
  return "employee-share";
}

const technicalRolePattern = /\b(?:software|hardware|electrical|mechanical|systems?|cloud|network|security|machine learning|ML|AI)\s+(?:development\s+)?(?:engineer|engineering|developer|architect)|\b(?:engineer|engineering|developer|data scientist|applied scientist|research scientist|technical program managers?|TPMs?|PM-Ts?|ML data associate|robotics|DevOps|SRE)\b/iu;

function classifyNonTechnicalRole(text: string): RoleFamily {
  if (/\b(?:financial|finance|accounting|accountant|controller|economists?|treasury|tax)\b/iu.test(text)) return "Finance";
  if (/\b(?:account strategist|account manager|account executive|sales|customer solutions|business development|partnerships?|commercial)\b/iu.test(text)) return "Sales & Partnerships";
  if (/\b(?:area manager|site manager|supply chain|operations?|logistics|procurement|vendor|category manager|topology|workplace health|EHS|injury prevention|safety manager)\b/iu.test(text)) return "Operations & Supply Chain";
  if (/\b(?:product|program|project|portfolio)\s+(?:lead|manager)|\bPM-T\b/iu.test(text)) return "Product, Program & Project";
  if (/\b(?:marketing|media|communications?|brand(?:ing)?\b(?!-)|go[- ]to[- ]market|GTM|campaign|growth)\b/iu.test(text)) return "Marketing & Communications";
  if (/\b(?:art director|designer|design|creative|content|studio|production)\b/iu.test(text)) return "Creative & Design";
  if (/\b(?:legal|counsel|attorney|policy|compliance|risk|regulatory)\b/iu.test(text)) return "Legal, Policy & Risk";
  if (/\b(?:recruiter|recruiting|talent|human resources|HR|people|benefits?)\b/iu.test(text)) return "People & Recruiting";
  if (/\b(?:strategy|strategist|analytics?|analytical|measurement|insights?|research|planning)\b/iu.test(text)) return "Analytics & Strategy";
  return "Other";
}

export function classifyRoleFamily(title: string, content: string): RoleFamily {
  const titleText = title.trim();
  const technicalText = titleText.length > 3 ? titleText : content;
  if (technicalRolePattern.test(technicalText)) return "Technical";

  // The opportunity title is often a headline rather than a role ("Building
  // the future of Vulnerability Management for the AI era.") while the actual
  // role signal lives in the body ("I'm hiring a Lead Vulnerability
  // Management Engineer"). Fall through to the body before assigning a
  // non-technical family.
  if (technicalText !== content && technicalRolePattern.test(content)) return "Technical";

  const titleFamily = classifyNonTechnicalRole(titleText);
  return titleFamily === "Other" ? classifyNonTechnicalRole(content) : titleFamily;
}

export function isNonHiringNoise(text: string) {
  return /\b(?:looking for my next (?:role|opportunity)|actively looking for|on behalf of my (?:wife|husband|partner)|call for proposals|\bCFP\b|submit your proposal|requests? for referrals?|commenting for visibility|hiring pattern|hire AI instead|why did you get laid off|book recommendation|graduated as an? Amazon|internship comes to an end)\b/iu.test(text);
}

export function hasHiringIntent(text: string) {
  return /\b(?:I(?:'|’)?m hiring|I am hiring|we(?:'|’)?re hiring|we are hiring|my team (?:is |'s )?hiring|our team (?:is |'s )?hiring|now hiring|hiring for|open roles?|open positions?|apply (?:here|now|today)|join (?:my|our|the) team|job ID)\b/iu.test(text);
}
