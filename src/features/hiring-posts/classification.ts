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
  "Albania", "Argentina", "Australia", "Austria", "Bangladesh", "Belarus",
  "Belgium", "Bolivia", "Bosnia", "Brazil", "Britain", "Bulgaria", "Cambodia",
  "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cyprus",
  "Czech Republic", "Czechia", "Denmark", "Dominican Republic", "Ecuador",
  "Egypt", "England", "Estonia", "Ethiopia", "Finland", "France", "Germany",
  "Ghana", "Greece", "Guatemala", "Hong Kong", "Hungary", "Iceland", "India",
  "Indonesia", "Ireland", "Israel", "Italy", "Japan", "Kazakhstan", "Kenya",
  "Kuwait", "Latvia", "Lithuania", "Luxembourg", "Malaysia", "Malta", "Mexico",
  "Moldova", "Morocco", "Myanmar", "Nepal", "Netherlands", "New Zealand",
  "Nigeria", "Northern Ireland", "Norway", "Oman", "Pakistan", "Paraguay",
  "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Saudi Arabia", "Scotland", "Serbia", "Singapore", "Slovakia", "Slovenia",
  "South Africa", "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland",
  "Taiwan", "Thailand", "Tunisia", "Turkey", "Türkiye", "Ukraine",
  "United Arab Emirates", "United Kingdom", "Uruguay", "Venezuela", "Vietnam",
  "Wales", "APAC", "Asia Pacific", "Benelux", "DACH", "EMEA", "Europe",
  "European Union", "LATAM", "Latin America", "Middle East", "Nordics",
  "Southeast Asia", "U.K.", "UK",
];

/**
 * Country names alone miss the most common way a post states a non-US role:
 * naming the office city ("My team at Amazon Hyderabad is hiring", "#Hyderabad")
 * with no country anywhere in the text. Such a post scored no signal either
 * way, landed on "unknown", and "unknown" is shown in the U.S. feed.
 *
 * The list also backstops the country list for towns too small to appear in
 * it — a Prague-area warehouse post naming only "Dobrovíz" is caught by
 * "Czech Republic" in the sentence, but a post naming the town alone is not.
 *
 * Only cities without a meaningful U.S. namesake are listed. Dublin, Vienna,
 * Cambridge, Birmingham, Manchester, Athens, Rome, Naples, Bristol, Glasgow,
 * Perth, Lima and Hamburg are deliberately absent: each is also a U.S. city,
 * and a false "outside-us" silently hides a real lead, which is the worse
 * failure of the two.
 */
const outsideUsCities = [
  // India — the gap this list was added for.
  "Hyderabad", "Bengaluru", "Bangalore", "Mumbai", "Pune", "Chennai",
  "Gurgaon", "Gurugram", "Noida", "Kolkata", "Ahmedabad", "New Delhi",
  // Canada
  "Toronto", "Vancouver", "Montreal", "Ottawa", "Calgary",
  // Europe
  "London", "Amsterdam", "Barcelona", "Madrid", "Munich", "Berlin", "Paris",
  "Warsaw", "Krakow", "Lisbon", "Bucharest", "Prague", "Zurich", "Geneva",
  "Stockholm", "Copenhagen", "Helsinki", "Oslo", "Milan", "Edinburgh",
  "Brno", "Bratislava", "Budapest", "Zagreb", "Belgrade", "Ljubljana",
  "Kyiv", "Kiev", "Vilnius", "Riga", "Tallinn", "Wroclaw", "Wrocław",
  "Gdansk", "Gdańsk", "Frankfurt", "Düsseldorf", "Dusseldorf", "Utrecht",
  "Eindhoven", "Brussels", "Marseille", "Toulouse", "Bordeaux", "Basel",
  "Reykjavik", "Thessaloniki", "Porto", "Turin", "Bologna",
  // Middle East & Africa
  "Tel Aviv", "Dubai", "Abu Dhabi", "Riyadh", "Cairo", "Nairobi", "Lagos",
  "Johannesburg", "Cape Town", "Doha", "Muscat", "Kuwait City", "Istanbul",
  "Ankara", "Casablanca", "Accra", "Addis Ababa",
  // APAC
  "Tokyo", "Seoul", "Shanghai", "Beijing", "Shenzhen", "Taipei", "Sydney",
  "Melbourne", "Manila", "Bangkok", "Jakarta", "Kuala Lumpur", "Ho Chi Minh",
  "Osaka", "Kyoto", "Guangzhou", "Chengdu", "Hangzhou", "Hanoi", "Auckland",
  "Brisbane", "Karachi", "Lahore", "Islamabad", "Dhaka", "Colombo", "Almaty",
  // LATAM
  "Sao Paulo", "São Paulo", "Buenos Aires", "Bogota", "Bogotá",
  "Mexico City", "Guadalajara", "Santiago", "Monterrey", "Montevideo",
  "Medellin", "Medellín", "Quito",
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Regions a U.S. post names instead of a state. "New England" has to be here
 * rather than only in the shadow list below: blanking it for the outside test
 * without scoring it as domestic left such a post with no signal at all.
 */
const usRegionPattern = /\b(?:New England|Bay Area|Silicon Valley|Pacific Northwest|Puerto Rico)\b/iu;

/**
 * Cities that settle a post as domestic on their own. Plenty of U.S. posts
 * name the office city and never the state ("networking events: Boston —
 * Sept 23"), which scored no signal at all and landed on "unknown".
 *
 * Mirrors the rule the outside-U.S. city list follows, in reverse: a city
 * with a meaningful non-U.S. namesake is left out. Dublin, Vienna, Cambridge,
 * Birmingham, Manchester, Athens, Rome, Naples and Richmond are absent for
 * exactly the reason they are absent there. Where a post names both a U.S.
 * and a non-U.S. place the existing both-signals rule still returns
 * "unknown", so a shared name degrades to "needs checking" rather than
 * silently claiming the post.
 */
const usCityNames = [
  "Boston", "Seattle", "Los Angeles", "San Francisco", "San Jose", "San Diego",
  "New York City", "Brooklyn", "Manhattan", "Chicago", "Denver", "Austin",
  "Atlanta", "Nashville", "Philadelphia", "Phoenix", "Detroit", "Minneapolis",
  "Pittsburgh", "Sunnyvale", "Bellevue", "Redmond", "Cupertino", "Palo Alto",
  "Mountain View", "Santa Monica", "Culver City", "Arlington", "Herndon",
  "Charlotte", "Raleigh", "Tampa", "Orlando", "Jacksonville", "Columbus",
  "Dallas", "Houston", "Kansas City", "St. Louis", "Tempe", "Indianapolis",
  "Oklahoma City", "New Orleans", "Charleston", "Las Vegas", "Salt Lake City",
  "Portland", "Sacramento", "Baltimore", "Milwaukee", "Cincinnati",
  "Cleveland", "Memphis", "Louisville", "Hoboken", "Sunnyvale",
  // Amazon writes its Arlington, VA headquarters this way.
  "HQ2",
];

const usCityPattern = new RegExp(`\\b(?:${usCityNames.map(escapeRegex).join("|")})\\b`, "iu");

const usStatePattern = new RegExp(`\\b(?:${usStateNames.map(escapeRegex).join("|")})\\b`, "iu");
const usStateCodePattern = new RegExp(`,\\s*(?:${usStateCodes.join("|")})\\b`, "u");
const outsideUsPattern = new RegExp(
  `\\b(?:${[...outsideUsNames, ...outsideUsCities].map(escapeRegex).join("|")})\\b`,
  "iu",
);

/**
 * Two U.S. places spell an entry of the outside list inside themselves:
 * "New Mexico" contains Mexico, "New England" contains England. Left alone
 * they hand a Santa Fe or a Boston post a foreign signal. Blank them before
 * the outside test — the U.S. test runs on the untouched text, so the state
 * and the region still register as domestic.
 */
const usPhrasesShadowingOutsideNames = /\bNew (?:Mexico|England)\b/giu;

/**
 * A country flag is a pair of regional indicator symbols encoding an ISO 3166
 * code — 🇮🇪 is U+1F1EE U+1F1EA, "IE". Two Meta posts advertised Dublin roles,
 * and the flag was the only thing in either post that settled which Dublin:
 * the city lists leave it out on purpose, because Ohio and California have one
 * too. Flags are unusually trustworthy for this — nobody types one by accident
 * — so they count as a location signal in their own right.
 */
const flagEmojiPattern = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
const regionalIndicatorBase = 0x1f1e6;
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryCodesFromFlags(text: string) {
  return [...text.matchAll(flagEmojiPattern)].map((match) => [...match[0]]
    .map((char) => String.fromCodePoint(
      "A".codePointAt(0)! + (char.codePointAt(0)! - regionalIndicatorBase),
    ))
    .join(""));
}

function countryNameFromCode(code: string) {
  try {
    const name = regionNames.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

function locationStatus(text: string) {
  const flagCodes = countryCodesFromFlags(text);
  const hasUsSignal = /\b(?:United States|USA|U\.S\.A?\.)\b/iu.test(text)
    || usStatePattern.test(text)
    || usStateCodePattern.test(text)
    || usRegionPattern.test(text)
    || usCityPattern.test(text)
    || flagCodes.includes("US");
  const hasOutsideSignal = outsideUsPattern.test(
    text.replace(usPhrasesShadowingOutsideNames, " "),
  ) || flagCodes.some((code) => code !== "US" && countryNameFromCode(code) !== null);

  if (hasUsSignal && hasOutsideSignal) return "unknown" as const;
  if (hasUsSignal) return "us" as const;
  if (hasOutsideSignal) return "outside-us" as const;
  return "unknown" as const;
}

/**
 * A 📍 does not always introduce a place. One Amazon post used it to open a
 * list of recruiting events — "📍 We're hosting networking events this fall:
 * Boston — Sept 23 HQ2 — Sept 24 …" — and 220 characters of prose became the
 * post's location label. Worse, status was read from that fragment alone, so
 * a post naming two U.S. cities was filed as "unknown".
 *
 * A real location fragment is short and starts with a place, not a sentence.
 */
const locationFragmentMaxLength = 80;

const prosePrefix = /^(?:we|i|our|my|come|join|feel free|apply|tag|dm|share|check|click|hiring|looking)\b/iu;

function plausibleLocationFragment(fragment: string) {
  const head = fragment.split(/[.:;!?]/u)[0].trim().replace(/[,·|-]+$/u, "").trim();
  if (head.length < 2 || head.length > locationFragmentMaxLength) return null;
  if (prosePrefix.test(head)) return null;
  return head;
}

function explicitLocationFragment(text: string) {
  const labeled = text.match(
    /(?:📍\s*(?:Open\s+)?Locations?\s*:?\s*|(?:Open\s+)?\bLocations?\s*:\s*)([^\r\n]{2,220})/iu,
  )?.[1]?.trim();
  if (labeled) return plausibleLocationFragment(labeled);

  const pinned = text.match(/📍\s*([^\r\n]{2,220})/u)?.[1]?.trim();
  return pinned ? plausibleLocationFragment(pinned) : null;
}

function locationLabel(text: string, status: HiringPostLocation["status"]) {
  const fragment = explicitLocationFragment(text);
  if (fragment) return fragment;

  const state = text.match(usStatePattern)?.[0]
    ?? text.match(usRegionPattern)?.[0]
    ?? text.match(usCityPattern)?.[0];
  if (state) return state;

  const country = text.replace(usPhrasesShadowingOutsideNames, " ").match(outsideUsPattern)?.[0];
  if (country) return country;

  if (status === "outside-us") {
    const flagged = countryCodesFromFlags(text)
      .filter((code) => code !== "US")
      .map(countryNameFromCode)
      .find((name) => name !== null);
    if (flagged) return flagged;
  }

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

  // The fragment is the best label when it exists, but it is a slice of the
  // post rather than the whole evidence. Reading status from it alone filed a
  // post as "unknown" whenever the place was stated outside the pin, so fall
  // back to the full text when the fragment settles nothing.
  const fragmentStatus = explicitLocation ? locationStatus(explicitLocation) : "unknown";
  const status = fragmentStatus === "unknown" ? locationStatus(text) : fragmentStatus;
  return {
    label: explicitLocation ?? locationLabel(text, status),
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
