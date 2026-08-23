import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyNonTechnicalRole,
  classifyTechnicalRole,
  companyInitials,
  compactExperienceEvidence,
  experienceBadge,
  extractExperienceRequirement,
  extractMinYearsExperience,
  matchesExperienceFilter,
  matchesRoleTypeFilter,
  portalAudience,
} from "./display.ts";

test("companyInitials returns stable short labels", () => {
  assert.equal(companyInitials("Black Forest Labs"), "BF");
  assert.equal(companyInitials("Stripe"), "ST");
  assert.equal(companyInitials("Genspark.ai"), "GE");
});

test("classifyTechnicalRole identifies technical families", () => {
  assert.equal(classifyTechnicalRole("Applied Scientist").matchedCategory, "AI & Applied Science");
  assert.equal(classifyTechnicalRole("ML Engineer").matchedCategory, "Machine Learning Engineering");
  assert.equal(classifyTechnicalRole("Data Scientist").matchedCategory, "Data Science");
  assert.equal(
    classifyTechnicalRole("Analytics Engineer").matchedCategory,
    "Analytics & Business Intelligence",
  );
  assert.equal(classifyTechnicalRole("Forward Deployed Engineer").matchedCategory, "Forward Deployed");
  assert.equal(classifyTechnicalRole("Software Engineer").matchedCategory, "Software Engineering");
  assert.equal(classifyTechnicalRole("Data Platform Engineer").matchedCategory, "Data Engineering");
  assert.equal(classifyTechnicalRole("SRE").matchedCategory, "Platform & Infrastructure");
  assert.equal(
    classifyTechnicalRole("Security Engineer, Corporate Services Security").matchedCategory,
    "Security Engineering",
  );
  assert.equal(classifyTechnicalRole("Cloud Security Engineer").matchedCategory, "Security Engineering");
  assert.equal(classifyTechnicalRole("Security Software Engineer").matchedCategory, "Security Engineering");
  assert.equal(classifyTechnicalRole("Quantitative Researcher").matchedCategory, "Quant & Trading Technology");
  assert.equal(classifyTechnicalRole("Robotics Engineer").matchedCategory, "Robotics");
});

test("classifyTechnicalRole catches every software-engineering title variant", () => {
  for (const title of [
    "Software Engineer",
    "Software Development Engineer",
    "Software Development Engineer II",
    "Software Developer Engineer",
    "Staff Software Engineer",
    "Staff Software Developer Engineer",
    "Senior Software Engineer",
    "SWE",
    "SWE II",
    "SDE II",
    "Software Engineer Intern",
  ]) {
    assert.equal(
      classifyTechnicalRole(title).matchedCategory,
      "Software Engineering",
      `expected "${title}" to classify as Software Engineering`,
    );
  }
});

test("classifyTechnicalRole excludes commercial, support, and leadership roles from default", () => {
  assert.equal(classifyTechnicalRole("Engineering Manager").matchedCategory, "Needs Review");
  assert.equal(classifyTechnicalRole("Technical Program Manager").matchedCategory, "Needs Review");
  assert.equal(classifyTechnicalRole("Technical Support Engineer").matchedCategory, "Needs Review");
  assert.equal(classifyTechnicalRole("Sales Engineer").matchedCategory, "Needs Review");
  assert.equal(classifyTechnicalRole("Solutions Consultant").matchedCategory, "Needs Review");
});

test("classifyTechnicalRole routes office operations roles to Operations & Support", () => {
  for (const title of [
    "Logistics Coordinator",
    "Facilities Coordinator",
    "Executive Assistant",
    "Administrative Assistant",
  ]) {
    assert.equal(
      classifyTechnicalRole(title).matchedCategory,
      "Operations & Support",
      `expected "${title}" to classify as Operations & Support`,
    );
  }
});

test("classifyTechnicalRole routes manual and field labour to Manual & Field Operations (no portal)", () => {
  for (const title of [
    "Data Center Technician",
    "Data Center Technician, DCC Communities",
    "Data Center Technician Night Shift",
    "Engineering Operations Technician",
    "Network Install Technician, CLT DCO",
    "Data Center Logistics Specialist",
    "R&D Maintenance Tech II",
    "Warehouse Associate",
    "Warehouse Worker",
    "Fulfillment Associate",
    "Sortation Associate",
    "Delivery Driver",
    "Ground Handler",
    "Janitor",
    "Maintenance Technician",
  ]) {
    assert.equal(
      classifyTechnicalRole(title).matchedCategory,
      "Manual & Field Operations",
      `expected "${title}" to classify as Manual & Field Operations`,
    );
  }
  assert.deepEqual(portalAudience("Manual & Field Operations"), []);
});

test("classifyTechnicalRole routes business roles to Non-Technical", () => {
  for (const title of [
    "Account Executive",
    "Strategic Account Executive, Industries",
    "Product Designer, Design Systems",
    "Executive Recruiter",
    "Financial Analyst III",
    "Counsel, Product & Commercial",
    "People Business Associate",
    "User Researcher",
  ]) {
    assert.equal(
      classifyTechnicalRole(title).matchedCategory,
      "Non-Technical",
      `expected "${title}" to classify as Non-Technical`,
    );
  }
});

test("test and QA engineers are technical and hidden from the non-technical feed", () => {
  for (const title of [
    "IT Operations Analyst",
    "Test Engineer, Amazon Devices Reverse Logistics",
  ]) {
    assert.notEqual(classifyTechnicalRole(title).matchedCategory, "Operations & Support");
    assert.equal(classifyNonTechnicalRole(title), "Other", `"${title}" must be hidden from non-tech`);
  }
});

test("accountants and analysts belong to non-tech, test engineers to technical", () => {
  assert.equal(classifyTechnicalRole("Fixed Asset Accountant").matchedCategory, "Non-Technical");
  assert.equal(classifyTechnicalRole("Category Analyst, Category Analytics").matchedCategory, "Non-Technical");
  assert.equal(classifyNonTechnicalRole("Fixed Asset Accountant"), "Finance & Accounting");
  assert.equal(classifyNonTechnicalRole("Category Analyst, Category Analytics"), "Analytics & Strategy");
  assert.equal(classifyTechnicalRole("Test Engineer, Amazon Devices Reverse Logistics").matchedCategory, "Software Engineering");
});

test("presales and engineering-ops titles never land in the non-technical feed", () => {
  for (const title of [
    "Solutions Architect",
    "Generative AI Solutions Architect, AWS",
    "Specialist Solutions Architect - Data Engineering",
    "Delivery Solutions Architect - Retail",
    "IT Operations Analyst",
    "HPC Operations Engineer",
    "AI Operations Engineer, Partnerships",
    "Automation Engineer",
    "Actuator Design Engineer",
    "Package Layout Design Engineer, Annapurna Labs",
  ]) {
    const category = classifyTechnicalRole(title).matchedCategory;
    assert.notEqual(category, "Non-Technical", `"${title}" must not be Non-Technical`);
    assert.notEqual(category, "Operations & Support", `"${title}" must not be office Operations`);
  }
});

test("hardware and embedded engineering titles are technical, never Needs Review", () => {
  for (const title of [
    "Supply Chain Engineer, Amazon Prime Air, Hardware Dev Engr II - Supply Chain Engineering & Operations",
    "Hardware Engineer, Compute",
    "Embedded Firmware Engineer",
    "Firmware Engineer",
    "Silicon Design Engineer",
    "ASIC Design Engineer",
    "FPGA Engineer",
    "Electrical Engineer, Robotics",
  ]) {
    const category = classifyTechnicalRole(title).matchedCategory;
    assert.equal(category, "Hardware & Embedded Engineering", `"${title}" should be Hardware & Embedded Engineering`);
  }
});

test("classifyNonTechnicalRole keeps engineering-ops titles out of Operations & Supply Chain", () => {
  for (const title of [
    "IT Operations Analyst",
    "HPC Operations Engineer",
    "AI Operations Engineer, Partnerships",
    "Legal Engineering Operations Associate",
  ]) {
    assert.notEqual(
      classifyNonTechnicalRole(title),
      "Operations & Supply Chain",
      `"${title}" must not be a non-tech Operations role`,
    );
  }
});

test("classifyNonTechnicalRole splits design from marketing and maps chief of staff to ops", () => {
  assert.equal(classifyNonTechnicalRole("Product Designer"), "Design & Creative");
  assert.equal(classifyNonTechnicalRole("Art Director"), "Design & Creative");
  assert.equal(classifyNonTechnicalRole("Brand Designer"), "Design & Creative");
  assert.equal(classifyNonTechnicalRole("Marketing Manager"), "Marketing & Communications");
  assert.equal(classifyNonTechnicalRole("Chief of Staff"), "Operations & Supply Chain");
});

test("portalAudience puts analytics on both portals", () => {
  assert.deepEqual(portalAudience("Analytics & Business Intelligence"), ["tech", "non-tech"]);
  assert.deepEqual(portalAudience("Data Science"), ["tech"]);
  assert.deepEqual(portalAudience("Manual & Field Operations"), []);
});

test("classifyTechnicalRole catches Amazon abbreviated SWE titles", () => {
  for (const title of [
    "Software Dev Engineer",
    "Software Dev Engineer III",
    "Software Dev Eng, Digital Twin, Amazon Leo",
    "Systems Development Engineer, Aurora Storage",
    "System Development Engineer, STRADA",
  ]) {
    assert.equal(
      classifyTechnicalRole(title).matchedCategory,
      "Software Engineering",
      `expected "${title}" to classify as Software Engineering`,
    );
  }
});

test("extractExperienceRequirement finds required year requirements", () => {
  assert.equal(extractMinYearsExperience("Requires 2+ years of experience"), 2);
  assert.equal(extractMinYearsExperience("You have 1-3 years building products"), 1);
  assert.equal(extractMinYearsExperience("At least three years of relevant work"), 3);
  assert.equal(
    extractMinYearsExperience("Minimum qualifications: 2 years. Preferred qualifications: 7 years."),
    2,
  );
  assert.equal(extractMinYearsExperience("No explicit years listed"), null);
});

test("extractExperienceRequirement separates preferred-only evidence", () => {
  const requirement = extractExperienceRequirement("Preferred qualifications: 2+ years of ML experience.");
  assert.equal(requirement.status, "preferred-only");
  assert.equal(requirement.effectiveMinYears, null);
  assert.equal(requirement.evidence[0].section, "preferred");
});

test("extractExperienceRequirement marks alternatives and uses the minimum path", () => {
  const requirement = extractExperienceRequirement("Requires 4 years of software experience or 2 years with distributed systems.");
  assert.equal(requirement.status, "explicit");
  assert.equal(requirement.effectiveMinYears, 2);
  assert.equal(requirement.evidence[0].isAlternative, true);
});

test("extractExperienceRequirement marks conflicting required numbers", () => {
  // Only genuinely non-overlapping ranges are contradictory; plain
  // multi-skill bullets ("2 years of Python, 5 years of backend") are
  // cumulative and covered by the multi-skill cumulative test above.
  const requirement = extractExperienceRequirement("Requires 2-4 years of Python. Requires 6+ years of backend systems.");
  assert.equal(requirement.status, "conflicting");
  assert.equal(requirement.effectiveMinYears, 6);
});

test("extractExperienceRequirement ignores planning-horizon year mentions", () => {
  // "3-5 years" here is a business planning horizon, not a candidate
  // requirement. It must not conflict with the real qualification bullet.
  const requirement = extractExperienceRequirement(
    "We integrate end-to-end fulfillment analytics across both the short term (13 weeks) and long term (3-5 years) horizon. - 2+ years of analyzing and interpreting data with Redshift, Oracle, NoSQL etc.",
  );
  assert.equal(requirement.status, "explicit");
  assert.equal(requirement.effectiveMinYears, 2);
  assert.equal(
    requirement.evidence.some((item) => item.rawText.includes("horizon")),
    false,
    "planning-horizon sentences must not produce evidence",
  );
});

test("extractExperienceRequirement ignores equity vesting periods", () => {
  const requirement = extractExperienceRequirement(
    "Generous equity grant vested over 4 years. - 2+ years of fullstack engineering experience building and shipping production software.",
  );
  assert.equal(requirement.status, "explicit");
  assert.equal(requirement.effectiveMinYears, 2);
  assert.equal(
    requirement.evidence.some((item) => item.rawText.includes("vested")),
    false,
    "vesting sentences must not produce evidence",
  );
});

test("extractExperienceRequirement treats compound requirements as cumulative, not conflicting", () => {
  const requirement = extractExperienceRequirement(
    "You might thrive in this role if you: Have 3+ years of experience as a data engineer and 8+ years of any software engineering experience.",
  );
  assert.equal(requirement.status, "explicit");
  assert.equal(requirement.effectiveMinYears, 8);
});

test("extractExperienceRequirement treats multi-skill bullets as cumulative, not conflicting", () => {
  // Different skills, different years: the max is the binding constraint.
  const requirement = extractExperienceRequirement(
    "Requires 2 years of Python. Requires 5 years of backend systems.",
  );
  assert.equal(requirement.status, "explicit");
  assert.equal(requirement.effectiveMinYears, 5);
});

test("extractExperienceRequirement ignores biographical career history", () => {
  const requirement = extractExperienceRequirement(
    "Before founding Sierra, Clay spent 18 years at Google, where he most recently led Google Labs. - 4+ years hands-on experience building production products and systems.",
  );
  assert.equal(requirement.status, "explicit");
  assert.equal(requirement.effectiveMinYears, 4);
  assert.equal(
    requirement.evidence.some((item) => item.rawText.includes("spent")),
    false,
    "biographical sentences must not produce evidence",
  );
});

test("extractExperienceRequirement marks genuinely non-overlapping ranges as conflicting", () => {
  const requirement = extractExperienceRequirement(
    "Requires 2-4 years of Python. Requires 6+ years of backend systems.",
  );
  assert.equal(requirement.status, "conflicting");
  assert.equal(requirement.effectiveMinYears, 6);
});

test("compactExperienceEvidence removes unrelated description copy and preserves sections", () => {
  const compact = compactExperienceEvidence(
    "About us: this is a long company introduction. Required qualifications: 2+ years building data products. Team benefits include lunch. Preferred qualifications: 4 years working with analytics platforms.",
  );

  assert.match(compact, /Required Qualifications:.*2\+ years/u);
  assert.match(compact, /Preferred Qualifications:.*4 years/u);
  assert.doesNotMatch(compact, /company introduction|Team benefits/u);

  const requirement = extractExperienceRequirement(compact);
  assert.equal(requirement.effectiveMinYears, 2);
  assert.equal(requirement.evidence.some((item) => item.section === "preferred"), true);
});

test("matchesExperienceFilter defaults to required 1–3 years and excludes senior titles", () => {
  assert.equal(
    matchesExperienceFilter(extractExperienceRequirement("Requires 2 years of experience."), "Software Engineer", "early"),
    true,
  );
  assert.equal(
    matchesExperienceFilter(extractExperienceRequirement("Preferred qualifications: 2 years."), "Software Engineer", "early"),
    false,
  );
  assert.equal(
    matchesExperienceFilter(extractExperienceRequirement("Requires 2 years of experience."), "Senior Software Engineer", "early"),
    false,
  );
});

test("principal titles are always treated as very senior", () => {
  const notStated = extractExperienceRequirement("Experience requirements are not stated.");
  const conflicting = extractExperienceRequirement("Requires 2-4 years of Python. Requires 6+ years of backend systems.");

  assert.equal(matchesExperienceFilter(notStated, "Principal Software Engineer", "not_stated"), false);
  assert.equal(matchesExperienceFilter(conflicting, "Principal Applied Scientist", "conflicting"), false);
  assert.equal(matchesExperienceFilter(notStated, "Principal Something", "senior"), true);
  assert.match(experienceBadge(notStated, "Principal Something").label, /Very Senior/u);
});

test("matchesRoleTypeFilter uses the positive technical taxonomy", () => {
  assert.equal(matchesRoleTypeFilter("Software Engineer", "Software Engineering"), true);
  assert.equal(matchesRoleTypeFilter("Account Executive", "Software Engineering"), false);
  assert.equal(matchesRoleTypeFilter("Localization Specialist", "Needs Review"), true);
});

test("security titles classify as Security Engineering even when named 'Analyst'", () => {
  // Reported from the live feed: "Cyber Threat Intelligence Analyst III" fell
  // through to Non-Technical because the rule only matched the literal words
  // "security"/"cybersecurity", so "cyber" and "threat intelligence" missed.
  for (const title of [
    "Cyber Threat Intelligence Analyst III",
    "Threat Intelligence Analyst",
    "Detection and Response Engineer",
    "Incident Response Analyst",
    "Penetration Tester",
    "Vulnerability Management Analyst",
    "Red Team Operator",
    "SOC Analyst",
  ]) {
    assert.equal(
      classifyTechnicalRole(title).matchedCategory,
      "Security Engineering",
      `${title} should classify as Security Engineering`,
    );
  }
});

test("widening the security rule does not swallow genuinely non-technical analysts", () => {
  assert.equal(classifyTechnicalRole("Financial Analyst").matchedCategory, "Non-Technical");
  assert.equal(classifyTechnicalRole("Business Analyst").matchedCategory, "Non-Technical");
  assert.equal(
    classifyTechnicalRole("Data Analyst").matchedCategory,
    "Analytics & Business Intelligence",
  );
});
