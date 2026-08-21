import type { IconName } from "@/components/ui/Icon";
import {
  type ExperienceFilter,
  type RoleTypeFilter,
  technicalTrackOptions,
} from "../display";
import type { DateFilter } from "../filters";

export const roleTracks: RoleTypeFilter[] = [
  ...technicalTrackOptions(),
  "Needs Review",
];

export const defaultRoleTracks = roleTracks.filter(
  (track) =>
    track !== "Robotics" &&
    track !== "Software Engineering" &&
    track !== "Security Engineering" &&
    track !== "Manual & Field Operations" &&
    track !== "Operations & Support" &&
    track !== "Non-Technical",
);

export const defaultExperienceFilters: ExperienceFilter[] = [
  "early",
  "not_stated",
  "conflicting",
];

/**
 * Short, stable URL ids for each role track so filter state can live in the
 * query string without baking display labels into every link.
 */
export const roleTrackIds: Record<RoleTypeFilter, string> = {
  "AI & Applied Science": "ai",
  "Machine Learning Engineering": "ml",
  "Data Science": "ds",
  "Analytics & Business Intelligence": "bi",
  "Forward Deployed": "fde",
  "Software Engineering": "swe",
  "Hardware & Embedded Engineering": "hardware",
  "Data Engineering": "de",
  "Platform & Infrastructure": "platform",
  "Security Engineering": "security",
  "Quant & Trading Technology": "quant",
  Robotics: "robotics",
  "Manual & Field Operations": "manual",
  "Operations & Support": "ops",
  "Non-Technical": "nontech",
  "Needs Review": "review",
  all: "all",
};

const roleTrackIdLookup = new Map(
  Object.entries(roleTrackIds).map(([track, id]) => [id, track] as const),
);

export function roleTrackFromId(id: string): RoleTypeFilter | null {
  return (roleTrackIdLookup.get(id) as RoleTypeFilter | undefined) ?? null;
}

export const roleTrackIcons: Record<string, IconName> = {
  "AI & Applied Science": "brain",
  "Machine Learning Engineering": "cpu",
  "Data Science": "chart-bar",
  "Analytics & Business Intelligence": "layers",
  "Forward Deployed": "rocket",
  "Software Engineering": "code",
  "Hardware & Embedded Engineering": "chip",
  "Data Engineering": "database",
  "Platform & Infrastructure": "server",
  "Security Engineering": "shield",
  "Quant & Trading Technology": "trending-up",
  Robotics: "robot",
  "Manual & Field Operations": "alert-triangle",
  "Operations & Support": "wrench",
  "Non-Technical": "briefcase",
  "Needs Review": "eye",
};

export const dateFilterOptions: Array<{
  value: DateFilter;
  label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "6h", label: "6 Hours" },
  { value: "12h", label: "12 Hours" },
  { value: "24h", label: "24 Hours" },
  { value: "48h", label: "48 Hours" },
  { value: "3d", label: "3 Days" },
  { value: "week", label: "7 Days" },
  { value: "2w", label: "14 Days" },
  { value: "all", label: "All Dates" },
];

export const experienceFilterOptions: Array<{
  value: ExperienceFilter;
  label: string;
}> = [
  { value: "early", label: "1–3 Years" },
  { value: "mid", label: "4–5 Years" },
  { value: "senior", label: "6+ Years" },
  { value: "not_stated", label: "Not Stated" },
  { value: "conflicting", label: "Conflicting" },
  { value: "all", label: "All" },
];
