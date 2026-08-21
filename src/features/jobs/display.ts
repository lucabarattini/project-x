export type ExperienceEvidence = {
  minYears: number;
  maxYears: number | null;
  rawText: string;
  section: "required" | "preferred";
  isAlternative: boolean;
};

export type ExperienceRequirement = {
  effectiveMinYears: number | null;
  effectiveMaxYears: number | null;
  evidence: ExperienceEvidence[];
  status: "explicit" | "preferred-only" | "conflicting" | "not-stated";
};

export type ExperienceFilter =
  | "all"
  | "early"
  | "mid"
  | "senior"
  | "not_stated"
  | "conflicting";

export type TechnicalTrack =
  | "AI & Applied Science"
  | "Machine Learning Engineering"
  | "Data Science"
  | "Analytics & Business Intelligence"
  | "Forward Deployed"
  | "Software Engineering"
  | "Hardware & Embedded Engineering"
  | "Data Engineering"
  | "Platform & Infrastructure"
  | "Security Engineering"
  | "Quant & Trading Technology"
  | "Robotics"
  | "Manual & Field Operations"
  | "Operations & Support"
  | "Non-Technical"
  | "Needs Review";

export type RoleTypeFilter = TechnicalTrack | "all";

/**
 * Sub-families of the non-technical feed. Selected families drive the
 * non-technical portal's default filter; everything else falls to "Other".
 */
export const nonTechnicalFamilies = [
  "Sales & Partnerships",
  "Marketing & Communications",
  "Design & Creative",
  "Customer Success & Support",
  "Product & Program",
  "Finance & Accounting",
  "Operations & Supply Chain",
  "Analytics & Strategy",
] as const;

export type NonTechnicalFamily = (typeof nonTechnicalFamilies)[number] | "Other";

export const nonTechnicalFamilyOptions: NonTechnicalFamily[] = [
  ...nonTechnicalFamilies,
  "Other",
];

export type TechnicalClassification = {
  matchedCategory: TechnicalTrack;
  matchReason: string;
  includedByDefault: boolean;
};

const logoPalette = [
  "bg-sky-700 text-white",
  "bg-rose-700 text-white",
  "bg-emerald-700 text-white",
  "bg-violet-700 text-white",
  "bg-amber-600 text-white",
  "bg-slate-800 text-white",
  "bg-cyan-700 text-white",
  "bg-fuchsia-700 text-white",
];

const technicalFamilies: Array<{
  category: Exclude<TechnicalTrack, "Needs Review">;
  reason: string;
  patterns: RegExp[];
}> = [
  {
    category: "AI & Applied Science",
    reason: "Matched applied science, research science, AI engineering, research engineering, or MTS title.",
    patterns: [
      /\bapplied scientist\b/iu,
      /\bresearch scientist\b/iu,
      /\bAI engineer\b/iu,
      /\bresearch engineer\b/iu,
      /\bmember of technical staff\b/iu,
      /\bMTS\b/u,
    ],
  },
  {
    category: "Machine Learning Engineering",
    reason: "Matched ML engineering, MLOps, NLP engineering, computer vision engineering, or ML infrastructure title.",
    patterns: [
      /\bML engineer\b/iu,
      /\bmachine learning engineer\b/iu,
      /\bMLOps\b/iu,
      /\bNLP engineer\b/iu,
      /\bcomputer vision engineer\b/iu,
      /\bML infrastructure\b/iu,
      /\bmachine learning infrastructure\b/iu,
      /\bML platform\b/iu,
    ],
  },
  {
    category: "Data Science",
    reason: "Matched data science, decision science, ML science, or product data science title.",
    patterns: [
      /\bdata scientist\b/iu,
      /\bdecision scientist\b/iu,
      /\bML scientist\b/iu,
      /\bmachine learning scientist\b/iu,
      /\bcomputational scientist\b/iu,
    ],
  },
  {
    category: "Analytics & Business Intelligence",
    reason: "Matched analytics engineering, data analysis, product analysis, or business intelligence title.",
    patterns: [
      /\banalytics engineer\b/iu,
      /\bdata analyst\b/iu,
      /\bproduct analyst\b/iu,
      /\banalytics scientist\b/iu,
      /\bbusiness intelligence\b/iu,
      /\bBI engineer\b/iu,
    ],
  },
  {
    category: "Forward Deployed",
    reason: "Matched forward deployed engineering or data science title.",
    patterns: [
      /\bforward deployed engineer\b/iu,
      /\bforward deployed software engineer\b/iu,
      /\bforward deployed data scientist\b/iu,
      /\bFDE\b/iu,
    ],
  },
  {
    category: "Security Engineering",
    reason: "Matched security, application security, product security, cybersecurity, IAM, threat, or SOC engineering title.",
    patterns: [
      /\bsecurity\b/iu,
      /\bcybersecurity\b/iu,
      /\bIAM engineer\b/iu,
      /\bthreat engineer\b/iu,
      /\bSOC engineer\b/iu,
    ],
  },
  {
    category: "Software Engineering",
    reason: "Matched software, backend, full stack, product, systems, distributed systems engineering, or developer title.",
    patterns: [
      /\bsoftware engineer\b/iu,
      /\bsoftware development engineer\b/iu,
      /\bsoftware developer engineer\b/iu,
      /\bsoftware developer\b/iu,
      /\bsoftware dev\b/iu,
      /\bsystems? development engineer\b/iu,
      /\bsystem engineer\b/iu,
      /\bbackend engineer\b/iu,
      /\bback end engineer\b/iu,
      /\bfull stack engineer\b/iu,
      /\bfrontend engineer\b/iu,
      /\bfront end engineer\b/iu,
      /\bproduct engineer\b/iu,
      /\bsystems engineer\b/iu,
      /\bdistributed systems engineer\b/iu,
      /\bdeveloper\b/iu,
      /\bSWE\b/iu,
      /\bSDE\b/iu,
      /\btest engineer\b/iu,
      /\bQA engineer\b/iu,
      /\bSDET\b/iu,
      /\bquality assurance\b/iu,
    ],
  },
  {
    category: "Hardware & Embedded Engineering",
    reason: "Matched hardware, embedded, firmware, silicon or chip engineering title.",
    patterns: [
      /\bhardware engineer\b/iu,
      /\bhardware dev(?:elopment)?\b/iu,
      /\bhardware design\b/iu,
      /\bembedded (?:software )?engineer\b/iu,
      /\bfirmware engineer\b/iu,
      /\bVLSI\b/iu,
      /\bASIC\b/iu,
      /\bFPGA\b/iu,
      /\bsilicon\b/iu,
      /\bchip design\b/iu,
      /\bPCB\b/iu,
      /\belectrical engineer\b/iu,
      /\bmechanical engineer\b/iu,
    ],
  },
  {
    category: "Data Engineering",
    reason: "Matched data engineering, data platform, ETL, or data infrastructure title.",
    patterns: [
      /\bdata engineer\b/iu,
      /\bdata platform engineer\b/iu,
      /\bETL engineer\b/iu,
      /\bdata infrastructure\b/iu,
    ],
  },
  {
    category: "Platform & Infrastructure",
    reason: "Matched platform, infrastructure, cloud, DevOps, SRE, or network engineering title.",
    patterns: [
      /\bplatform engineer\b/iu,
      /\binfrastructure engineer\b/iu,
      /\bcloud engineer\b/iu,
      /\bDevOps\b/iu,
      /\bsite reliability engineer\b/iu,
      /\bSRE\b/iu,
      /\bnetwork engineer\b/iu,
      /\bIT (operations|support|analyst|technician)\b/iu,
    ],
  },
  {
    category: "Quant & Trading Technology",
    reason: "Matched quantitative research, quant development, algorithm development, or trading systems title.",
    patterns: [
      /\bquantitative researcher\b/iu,
      /\bquant developer\b/iu,
      /\bquant engineer\b/iu,
      /\balgorithm developer\b/iu,
      /\btrading systems engineer\b/iu,
    ],
  },
  {
    category: "Robotics",
    reason: "Matched robotics, autonomy, perception, or mechatronics engineering title.",
    patterns: [
      /\brobotics\b/iu,
      /\bautonomy\b/iu,
      /\bperception engineer\b/iu,
      /\bmechatronics engineer\b/iu,
    ],
  },
  {
    category: "Manual & Field Operations",
    reason: "Matched a manual, logistics or field-operations role (data-center tech, warehouse, fulfillment, drivers, janitorial). Belongs to no portal.",
    patterns: [
      /\bdata center\b/iu,
      /\btechnician\b/iu,
      /\bDCO tech\b/iu,
      /\bwarehouse\b/iu,
      /\bfulfillment\b/iu,
      /\bsortation\b/iu,
      /\bpacker\b/iu,
      /\bpicker\b/iu,
      /\bstocker\b/iu,
      /\bassembler\b/iu,
      /\bproduction (associate|worker|operator)\b/iu,
      /\bdelivery (driver|associate|worker|staff)\b/iu,
      /\bdriver\b/iu,
      /\bcourier\b/iu,
      /\bground handler\b/iu,
      /\bmaintenance\b/iu,
      /\bcustodian\b/iu,
      /\bjanitor\b/iu,
      /\bcleaner\b/iu,
      /\bsanitation\b/iu,
      /\blaborer\b/iu,
      /\bloader\b/iu,
      /\bsecurity officer\b/iu,
      /\bsecurity guard\b/iu,
      /\bmaid\b/iu,
      /\bhousekeeper\b/iu,
      /\bvalet\b/iu,
      /\bmail handler\b/iu,
      /\bparcel handler\b/iu,
      /\bcashier\b/iu,
      /\bbarista\b/iu,
      /\bwaiter\b/iu,
      /\bfood service\b/iu,
      /\bdishwasher\b/iu,
    ],
  },
  {
    category: "Operations & Support",
    reason: "Matched an office operations, facilities, logistics or operations-support role. Hidden from the default technical feed; shown on the non-technical feed.",
    patterns: [
      /\bfacilities\b/iu,
      /\blogistics\b/iu,
      /\bexecutive assistant\b/iu,
      /\boffice manager\b/iu,
      /\badministrative\b/iu,
      /\bbusiness operations\b/iu,
      /\bprogram operations\b/iu,
      /\boperations (coordinator|associate|specialist|lead)\b/iu,
      /\bworkplace\b/iu,
      /\breceptionist\b/iu,
    ],
  },
  {
    category: "Non-Technical",
    reason: "Matched a business, sales, people, finance, legal, design or customer-facing role. Belongs to the non-technical feed.",
    patterns: [
      /\baccount executive\b/iu,
      /\bsales\b/iu,
      /\baccount manager\b/iu,
      /\bbusiness development\b/iu,
      /\bcustomer\b/iu,
      /\bmarketing\b/iu,
      /\bcommunications\b/iu,
      /\bcomms\b/iu,
      /\bpartner development\b/iu,
      /\bprofessional services\b/iu,
      /\bstrategist\b/iu,
      /\brecruiter\b/iu,
      /\bsourcer\b/iu,
      /\bpeople (business|ops|operations)\b/iu,
      /\bhuman resources\b/iu,
      /\bexecutive business partner\b/iu,
      /\bexecutive assistant\b/iu,
      /\bfinancial analyst\b/iu,
      /\banalyst\b/iu,
      /\bfinance\b/iu,
      /\btreasury\b/iu,
      /\bcredit risk\b/iu,
      /\baccounting\b/iu,
      /\baccountant\b/iu,
      /\bcounsel\b/iu,
      /\blegal\b/iu,
      /\battorney\b/iu,
      /\bproduct designer\b/iu,
      /\bbrand designer\b/iu,
      /\bdesigner\b/iu,
      /\buser researcher\b/iu,
      /\bproduct manager\b/iu,
      /\bpolicy\b/iu,
    ],
  },
];

const excludedDefaultTitlePatterns = [
  /\bengineering manager\b/iu,
  /\bmanager\b/iu,
  /\bdirector\b/iu,
  /\bVP\b/u,
  /\bvice president\b/iu,
  /\bhead\b/iu,
  /\btechnical program manager\b/iu,
  /\bTPM\b/u,
  /\btechnical support\b/iu,
  /\bhelp desk\b/iu,
  /\bIT technician\b/iu,
  /\bsales engineer\b/iu,
  /\bsolutions consultant\b/iu,
  /\bsenior\b/iu,
  /\bsr\.?\b/iu,
  /\bstaff\b/iu,
  /\bprincipal\b/iu,
  /\blead\b/iu,
];

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  zero: 0,
};

const numberPattern =
  "(\\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";

function toNumber(value: string) {
  return numberWords[value.toLowerCase()] ?? Number(value);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function sentenceCaseSections(text: string) {
  const normalized = text.replace(/[–—]/gu, "-").replace(/\r?\n/gu, " ");
  const preferredIndex = normalized.search(/\bpreferred qualifications?\b|\bnice to have\b|\bpreferred experience\b/iu);
  const requiredPart = preferredIndex >= 0 ? normalized.slice(0, preferredIndex) : normalized;
  const preferredPart = preferredIndex >= 0 ? normalized.slice(preferredIndex) : "";

  return [
    { section: "required" as const, text: requiredPart },
    { section: "preferred" as const, text: preferredPart },
  ];
}

/**
 * Sentences that mention "N years" as a planning horizon, roadmap or forecast
 * rather than a candidate experience requirement. E.g. Amazon's "we integrate
 * analytics across the long term (3-5 years) horizon" would otherwise surface
 * as conflicting experience evidence against the real qualification bullet.
 */
const planningHorizonPattern =
  /\b(horizon|roadmap|forecast|outlook|timeline|planning horizon)\b|\b(long|short|mid)[-\s]?term\b|(?:over the next|in the next|next|coming)\s+\d{1,2}\s+years?/iu;

/**
 * Compensation- or equity-related time periods ("equity grant vested over 4
 * years") that mention years without being an experience requirement.
 */
const compensationPeriodPattern = /\b(?:vested|vesting)\b|\bequity grant\b|\bstock option\b/iu;

/**
 * Biographical career history ("Clay spent 18 years at Google before founding
 * Sierra") that mentions years without setting a candidate requirement.
 */
const biographyPattern = /\bspent\s+\d{1,2}\s*years?\b/iu;

function splitEvidenceSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|(?:\s+-\s+)/u)
    .map(normalizeWhitespace)
    .filter((sentence) => /\byears?\b/iu.test(sentence))
    .filter((sentence) => !planningHorizonPattern.test(sentence))
    .filter((sentence) => !compensationPeriodPattern.test(sentence))
    .filter((sentence) => !biographyPattern.test(sentence));
}

function extractEvidenceFromSentence(
  sentence: string,
  section: ExperienceEvidence["section"],
) {
  const evidence: ExperienceEvidence[] = [];
  const patterns = [
    { kind: "range", regex: new RegExp(`\\b${numberPattern}\\s*(?:-|to)\\s*${numberPattern}\\s*\\+?\\s*years?\\b`, "giu") },
    { kind: "minimum", regex: new RegExp(`\\bat least\\s+${numberPattern}\\s*\\+?\\s*years?\\b`, "giu") },
    { kind: "minimum", regex: new RegExp(`\\bminimum(?: of)?\\s+${numberPattern}\\s*\\+?\\s*years?\\b`, "giu") },
    { kind: "single", regex: new RegExp(`\\b${numberPattern}\\s*\\+?\\s*years?\\b`, "giu") },
  ];

  for (const { kind, regex } of patterns) {
    if (kind === "single" && evidence.length > 0) {
      continue;
    }

    for (const match of sentence.matchAll(regex)) {
      const rawText = normalizeWhitespace(match[0]);
      if (evidence.some((item) => item.rawText === rawText && item.section === section)) {
        continue;
      }

      const rangeMatch = rawText.match(new RegExp(`^${numberPattern}\\s*(?:-|to)\\s*${numberPattern}`, "iu"));
      const minYears = toNumber(match[1]);
      const maxYears = rangeMatch ? toNumber(match[2]) : null;
      evidence.push({
        minYears,
        maxYears,
        rawText: sentence,
        section,
        isAlternative: /\bor\b/iu.test(sentence),
      });
    }
  }

  if (/\bor\b/iu.test(sentence) && evidence.length > 1) {
    const minimum = Math.min(...evidence.map((item) => item.minYears));
    return evidence.filter((item) => item.minYears === minimum);
  }

  // A single sentence with several different minimums ("3+ years as a data
  // engineer and 8+ years of software engineering") is a cumulative
  // requirement, not a contradiction: the binding constraint is the max.
  const uniqueMins = new Set(evidence.map((item) => item.minYears));
  if (evidence.length > 1 && uniqueMins.size > 1) {
    const maximum = Math.max(...evidence.map((item) => item.minYears));
    return evidence.filter((item) => item.minYears === maximum);
  }

  return evidence;
}

export function extractExperienceRequirement(text: string): ExperienceRequirement {
  const evidence = sentenceCaseSections(text).flatMap(({ section, text: sectionText }) =>
    splitEvidenceSentences(sectionText).flatMap((sentence) =>
      extractEvidenceFromSentence(sentence, section),
    ),
  );

  const requiredEvidence = evidence.filter((item) => item.section === "required");

  if (requiredEvidence.length === 0) {
    return {
      effectiveMinYears: null,
      effectiveMaxYears: null,
      evidence,
      status: evidence.length > 0 ? "preferred-only" : "not-stated",
    };
  }

  const effectiveMinYears = Math.max(...requiredEvidence.map((item) => item.minYears));
  const minEvidence = requiredEvidence.filter((item) => item.minYears === effectiveMinYears);
  const maxValues = minEvidence.map((item) => item.maxYears).filter((value): value is number => value !== null);
  const uniqueMins = new Set(requiredEvidence.map((item) => item.minYears));

  // Different minimums usually describe cumulative requirements for different
  // skills ("6+ years in strategy, 3+ years in pricing"); the max binds. Only
  // flag "conflicting" when a stated range cannot overlap the effective
  // minimum (e.g. "2-4 years" next to "6+ years") — a genuine contradiction.
  const nonOverlappingRange = requiredEvidence.some(
    (item) => item.maxYears !== null && item.maxYears < effectiveMinYears,
  );

  return {
    effectiveMinYears,
    effectiveMaxYears: maxValues.length > 0 ? Math.min(...maxValues) : null,
    evidence,
    status: uniqueMins.size > 1 && nonOverlappingRange && !requiredEvidence.some((item) => item.isAlternative)
      ? "conflicting"
      : "explicit",
  };
}

export function extractMinYearsExperience(text: string) {
  return extractExperienceRequirement(text).effectiveMinYears;
}

function compactEvidenceSentence(rawText: string) {
  const normalized = normalizeWhitespace(rawText);
  const maxLength = 1_200;

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const yearsIndex = normalized.search(/\byears?\b/iu);
  const center = yearsIndex >= 0 ? yearsIndex : Math.floor(normalized.length / 2);
  const start = Math.max(0, center - 850);
  const end = Math.min(normalized.length, start + maxLength);

  return `${start > 0 ? "… " : ""}${normalized.slice(start, end)}${end < normalized.length ? " …" : ""}`;
}

/**
 * Keeps only the source sentences needed by the client-side experience parser.
 * Full provider descriptions can be several kilobytes each and made the RSC
 * payload tens of megabytes without adding anything to the job table.
 */
export function compactExperienceEvidence(text: string) {
  const requirement = extractExperienceRequirement(text);
  const sections: ExperienceEvidence["section"][] = ["required", "preferred"];

  return sections
    .map((section) => {
      const sentences = [
        ...new Set(
          requirement.evidence
            .filter((item) => item.section === section)
            .map((item) => compactEvidenceSentence(item.rawText)),
        ),
      ];

      if (sentences.length === 0) {
        return "";
      }

      const label = section === "required" ? "Required Qualifications" : "Preferred Qualifications";
      return `${label}: ${sentences.join(" ")}`;
    })
    .filter(Boolean)
    .join(" ");
}

export function classifyTechnicalRole(title: string): TechnicalClassification {
  for (const pattern of excludedDefaultTitlePatterns.slice(0, 12)) {
    if (pattern.test(title)) {
      return {
        matchedCategory: "Needs Review",
        matchReason: `Excluded from the default technical set by title pattern: ${pattern.source}`,
        includedByDefault: false,
      };
    }
  }

  for (const family of technicalFamilies) {
    if (family.patterns.some((pattern) => pattern.test(title))) {
      return {
        matchedCategory: family.category,
        matchReason: family.reason,
        includedByDefault: !hasSeniorOrManagerSignal(title),
      };
    }
  }

  return {
    matchedCategory: "Needs Review",
    matchReason: "No deterministic technical family matched this title.",
    includedByDefault: false,
  };
}

export function technicalTrackOptions() {
  return technicalFamilies.map((family) => family.category);
}

export function hasSeniorOrManagerSignal(title: string) {
  return excludedDefaultTitlePatterns.slice(12).some((pattern) => pattern.test(title)) ||
    excludedDefaultTitlePatterns.slice(0, 6).some((pattern) => pattern.test(title));
}

export function experienceBadge(requirement: ExperienceRequirement, title = "") {
  if (/\bprincipal\b/iu.test(title)) {
    return { label: "Principal · Very Senior", className: "border-rose-200 bg-rose-50 text-rose-900", dotClassName: "bg-rose-600" };
  }

  if (requirement.status === "conflicting") {
    return { label: "Conflicting", className: "border-purple-200 bg-purple-50 text-purple-800", dotClassName: "bg-purple-500" };
  }

  if (requirement.status === "not-stated" || requirement.status === "preferred-only") {
    return { label: "Not Stated", className: "border-slate-200 bg-slate-50 text-slate-700", dotClassName: "bg-slate-300" };
  }

  const minYears = requirement.effectiveMinYears;
  if (minYears !== null && minYears >= 1 && minYears <= 3) {
    return { label: "1–3 Years", className: "border-emerald-200 bg-emerald-50 text-emerald-800", dotClassName: "bg-emerald-500" };
  }

  if (minYears !== null && minYears >= 4 && minYears <= 5) {
    return { label: "4–5 Years", className: "border-amber-200 bg-amber-50 text-amber-900", dotClassName: "bg-amber-400" };
  }

  return { label: "6+ Years", className: "border-rose-200 bg-rose-50 text-rose-800", dotClassName: "bg-rose-500" };
}

export function experienceLabel(requirement: ExperienceRequirement, title = "") {
  const badge = experienceBadge(requirement, title);
  const firstEvidence = requirement.evidence[0];
  return firstEvidence
    ? `${badge.label} · ${firstEvidence.section} · ${firstEvidence.rawText}`
    : badge.label;
}

export function matchesExperienceFilter(
  requirement: ExperienceRequirement,
  title: string,
  filter: ExperienceFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (hasSeniorOrManagerSignal(title)) {
    return filter === "senior";
  }

  if (filter === "not_stated") {
    return requirement.status === "not-stated" || requirement.status === "preferred-only";
  }

  if (filter === "conflicting") {
    return requirement.status === "conflicting";
  }

  const minYears = requirement.effectiveMinYears;
  if (requirement.status !== "explicit" || minYears === null) {
    return false;
  }

  if (filter === "early") {
    return minYears >= 1 && minYears <= 3 && !hasSeniorOrManagerSignal(title);
  }

  if (filter === "mid") {
    return minYears >= 4 && minYears <= 5;
  }

  return minYears >= 6 || hasSeniorOrManagerSignal(title);
}

export function matchesRoleTypeFilter(title: string, filter: RoleTypeFilter) {
  if (filter === "all") {
    return true;
  }

  return classifyTechnicalRole(title).matchedCategory === filter;
}

const nonTechnicalFamilyPatterns: Array<{
  family: Exclude<NonTechnicalFamily, "Other">;
  patterns: RegExp[];
}> = [
  {
    family: "Sales & Partnerships",
    patterns: [
      /\baccount executive\b/iu,
      /\bsales\b/iu,
      /\baccount manager\b/iu,
      /\bbusiness development\b/iu,
      /\bpartner development\b/iu,
      /\bpartnerships? (manager|lead|director|associate|specialist|analyst|head)\b/iu,
      /\baccount strategist\b/iu,
      /\brevenue\b/iu,
    ],
  },
  {
    family: "Design & Creative",
    patterns: [
      /\bdesigner\b/iu,
      /\bcreative\b/iu,
      /\bart director\b/iu,
      /\billustrator\b/iu,
      /\bcopywriter\b/iu,
      /\bgraphic design\b/iu,
      /\bUX designer\b/iu,
      /\bUI designer\b/iu,
      /\bmotion design\b/iu,
      /\bphotographer\b/iu,
      /\bvideographer\b/iu,
      /\beditor\b/iu,
      /\bwriter\b/iu,
    ],
  },
  {
    family: "Marketing & Communications",
    patterns: [
      /\bmarketing\b/iu,
      /\bbrand\b/iu,
      /\bcontent\b/iu,
      /\bgrowth\b/iu,
      /\bcommunications?\b/iu,
      /\bcomms\b/iu,
      /\bPR\b/u,
      /\bpublic relations\b/iu,
      /\bseo\b/iu,
      /\bsocial media\b/iu,
      /\bproduct marketing\b/iu,
    ],
  },
  {
    family: "Customer Success & Support",
    patterns: [
      /\bcustomer success\b/iu,
      /\bcustomer care\b/iu,
      /\bcustomer experience\b/iu,
      /\bcustomer support\b/iu,
      /\bsuccess manager\b/iu,
      /\bCSM\b/iu,
      /\bsupport specialist\b/iu,
      /\baccount management\b/iu,
    ],
  },
  {
    family: "Product & Program",
    patterns: [
      /\bproduct manager\b/iu,
      /\bproduct lead\b/iu,
      /\bproduct operations\b/iu,
      /\bprogram manager\b/iu,
      /\bproject manager\b/iu,
      /\bprogram lead\b/iu,
      /\bproduct owner\b/iu,
    ],
  },
  {
    family: "Finance & Accounting",
    patterns: [
      /\bfinance\b/iu,
      /\bfinancial\b/iu,
      /\baccounting\b/iu,
      /\baccountant\b/iu,
      /\btreasury\b/iu,
      /\bcontroller\b/iu,
      /\bFP&A\b/iu,
      /\baudit\b/iu,
      /\btax\b/iu,
      /\bcredit risk\b/iu,
      /\bpayroll\b/iu,
    ],
  },
  {
    family: "Operations & Supply Chain",
    patterns: [
      /\boperations (coordinator|associate|specialist|lead)\b/iu,
      /\bchief of staff\b/iu,
      /\bsupply chain\b/iu,
      /\blogistics\b/iu,
      /\bbusiness operations\b/iu,
      /\bprogram operations\b/iu,
      /\bexecutive assistant\b/iu,
      /\boffice manager\b/iu,
      /\bfacilities\b/iu,
      /\badministrative\b/iu,
    ],
  },
  {
    family: "Analytics & Strategy",
    patterns: [
      /\bbusiness analyst\b/iu,
      /\bstrategy\b/iu,
      /\bstrategic\b/iu,
      /\bmarket analyst\b/iu,
      /\bmarket intelligence\b/iu,
      /\bresearch analyst\b/iu,
      /\bdata analyst\b/iu,
      /\bplanning analyst\b/iu,
      /\banalyst\b/iu,
    ],
  },
];

/**
 * Families deliberately left out of the non-technical feed (People/Recruiting
 * and Legal/Policy/Risk). These are hidden entirely rather than mapped to the
 * nearest visible family.
 */
const excludedNonTechnicalPatterns = [
  /\brecruiter\b/iu,
  /\bsourcer\b/iu,
  /\bhuman resources\b/iu,
  /\bpeople (business|ops|operations)\b/iu,
  /\bcounsel\b/iu,
  /\blegal\b/iu,
  /\battorney\b/iu,
  /\bparalegal\b/iu,
  /\bcompliance\b/iu,
  /\bpolicy\b/iu,
  /\barchitect\b/iu,
  /\bIT (operations|support|analyst|technician)\b/iu,
  /\btest engineer\b/iu,
  /\bQA engineer\b/iu,
  /\bSDET\b/iu,
  /\bquality assurance\b/iu,
];

/**
 * Splits a non-technical title into the family used by the non-technical
 * portal. Only titles the technical classifier did not place in a technical
 * family should be passed here; anything unmatched becomes "Other".
 */
export function classifyNonTechnicalRole(title: string): NonTechnicalFamily {
  if (excludedNonTechnicalPatterns.some((pattern) => pattern.test(title))) {
    return "Other";
  }
  for (const { family, patterns } of nonTechnicalFamilyPatterns) {
    if (patterns.some((pattern) => pattern.test(title))) {
      return family;
    }
  }
  return "Other";
}

/**
 * The job's portal audience. Technical families belong to the technical
 * portal; non-technical and operations roles belong to the non-technical
 * portal; unmatched roles are discoverable on both via Needs Review.
 */
export function portalAudience(
  category: TechnicalTrack,
): Array<"tech" | "non-tech"> {
  if (category === "Manual & Field Operations") return [];
  if (category === "Needs Review") return ["tech", "non-tech"];
  if (category === "Analytics & Business Intelligence") return ["tech", "non-tech"];
  if (category === "Non-Technical" || category === "Operations & Support") {
    return ["non-tech"];
  }
  return ["tech"];
}

export function companyInitials(company: string) {
  const normalized = company.replace(/[^a-z0-9 ]/gi, " ").trim();
  const words = normalized
    .split(/\s+/u)
    .filter((word) => !/^(ai|co|io|inc|llc|ltd)$/i.test(word));

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function companyLogoClassName(company: string) {
  const hash = [...company].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return logoPalette[hash % logoPalette.length];
}
