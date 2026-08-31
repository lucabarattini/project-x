import assert from "node:assert/strict";
import test from "node:test";
import { classifyRoleFamily, inferLocation, isNonHiringNoise } from "./classification";

test("classifyRoleFamily finds the technical role in the post body when the title is a headline", () => {
  const family = classifyRoleFamily(
    "🚀 Building the future of Vulnerability Management for the AI era.",
    "I'm hiring a Lead Vulnerability Management Engineer (Staff Level) to join my team in Austin, TX. "
      + "This is a Staff-level technical leadership role. #Cybersecurity #StaffEngineer #Hiring",
  );
  assert.equal(family, "Technical");
});

test("classifyRoleFamily keeps a direct engineering title technical", () => {
  assert.equal(classifyRoleFamily("Senior Software Engineer", "Join my team! #Hiring"), "Technical");
  assert.equal(classifyRoleFamily("Data Scientist", "We are hiring."), "Technical");
});

test("classifyRoleFamily does not treat 'brand-new' as a marketing signal", () => {
  const family = classifyRoleFamily(
    "",
    "We are building a brand-new team focused on analytics and insights.",
  );
  assert.equal(family, "Analytics & Strategy");
  assert.notEqual(family, "Marketing & Communications");
});

test("classifyRoleFamily still routes genuine business titles to non-technical families", () => {
  assert.equal(classifyRoleFamily("Account Executive", "We're hiring! Apply now."), "Sales & Partnerships");
  assert.equal(classifyRoleFamily("Marketing Manager", "Join our team."), "Marketing & Communications");
  assert.equal(classifyRoleFamily("Recruiter", "We are hiring engineers."), "People & Recruiting");
});

test("inferLocation flags U.S. and outside-U.S. signals", () => {
  assert.equal(inferLocation("Join us in Austin, TX").status, "us");
  assert.equal(inferLocation("Remote, USA").status, "us");
  assert.equal(inferLocation("London, United Kingdom").status, "outside-us");
  assert.equal(inferLocation("Location not verified").status, "unknown");
});

test("isNonHiringNoise catches job-search posts, not hiring posts", () => {
  assert.equal(isNonHiringNoise("I'm looking for my next role, please connect."), true);
  assert.equal(isNonHiringNoise("We're hiring engineers! Apply here."), false);
});

test("a post that names only a non-US office city is not U.S.", () => {
  // Reported from the live feed: an Amazon Hyderabad post carried no country
  // name, scored no signal either way, and "unknown" is shown in the U.S. feed.
  const post = inferLocation(
    "My team at Amazon Hyderabad is hiring for a Foreign Tax Senior Analyst! #Amazon #Hyderabad",
  );
  assert.equal(post.status, "outside-us");
  assert.equal(post.label, "Hyderabad");

  for (const city of ["Bengaluru", "Gurugram", "Toronto", "Tel Aviv", "Sao Paulo"]) {
    assert.equal(
      inferLocation(`We are hiring in ${city}`).status,
      "outside-us",
      `${city} should read as outside the U.S.`,
    );
  }
});

test("city names shared with U.S. towns still read as U.S. when a state is given", () => {
  // A false "outside-us" hides a real lead, so these stay out of the city list
  // and must keep resolving through their state signal.
  assert.equal(inferLocation("Our Cambridge, MA office is hiring").status, "us");
  assert.equal(inferLocation("Dublin, OH team is growing").status, "us");
  assert.equal(inferLocation("Vienna, VA opening").status, "us");
  assert.equal(inferLocation("Hiring in Seattle, WA").status, "us");
});

test("a post with no location signal at all stays unknown", () => {
  assert.equal(inferLocation("Remote role, apply now").status, "unknown");
});

test("a post naming a country the list had missed is not U.S.", () => {
  // Reported from the live feed: an Amazon Dobrovíz post said "Czech Republic"
  // in plain text, but only "Czechia" was listed, so it scored no signal, fell
  // to "unknown", and "unknown" is shown in the U.S. feed.
  const post = inferLocation(
    "I'm hiring! I'm looking for a Workplace Health & Safety Specialist "
      + "(Specialista BOZP) to join my team at Amazon in Dobrovíz, Czech Republic.",
  );
  assert.equal(post.status, "outside-us");
  assert.equal(post.label, "Czech Republic");

  for (const country of [
    "Czech Republic", "Slovakia", "Croatia", "Bulgaria", "Ukraine", "Estonia",
    "Pakistan", "Nigeria", "Qatar", "Uruguay", "Iceland", "Scotland",
  ]) {
    assert.equal(
      inferLocation(`We are hiring in ${country}`).status,
      "outside-us",
      `${country} should read as outside the U.S.`,
    );
  }
});

test("U.S. places that spell a foreign name inside themselves stay U.S.", () => {
  // "New Mexico" contains Mexico and "New England" contains England; both are
  // blanked before the outside-U.S. test so domestic posts keep their status.
  assert.equal(inferLocation("Hiring in Albuquerque, New Mexico").status, "us");
  assert.equal(inferLocation("Our New England sites are hiring").status, "us");
  assert.equal(inferLocation("Roles across New England and New Mexico").status, "us");

  // The label must not fall back to the shadowed country either.
  assert.notEqual(inferLocation("Hiring across New England, MA").label, "England");
});

test("a 📍 introducing prose is not treated as a location", () => {
  // From the live feed: an Amazon Accounting post used the pin to open a list
  // of recruiting events. The whole blurb became the label, and because status
  // was read from that fragment alone the post — which names Boston and Los
  // Angeles — was filed as "unknown" and shown as "Location not verified".
  const post = inferLocation(
    "Amazon accounting is hiring, and we're looking for curious, driven people. "
      + "📍 We're hosting networking events this fall: Boston — Sept 23 HQ2 — Sept 24 "
      + "Los Angeles — Oct 21 Come say hi, ask questions, and see if it's the right fit.",
  );
  assert.equal(post.status, "us");
  assert.equal(post.label, "Boston");
  assert.ok(post.label.length < 40, "a location label must not be a paragraph");
});

test("a 📍 that really does introduce a location still wins", () => {
  assert.equal(inferLocation("We are hiring! 📍 Seattle, WA").label, "Seattle, WA");
  assert.equal(inferLocation("📍 Location: Hyderabad, India").status, "outside-us");
  assert.equal(inferLocation("📍 London, United Kingdom").status, "outside-us");
});

test("a bare U.S. city settles a post with no state or country", () => {
  for (const city of ["Boston", "Denver", "Atlanta", "Bellevue", "HQ2"]) {
    assert.equal(
      inferLocation(`My team is hiring in ${city}`).status,
      "us",
      `${city} should read as U.S.`,
    );
  }
  // The ambiguous names stay out, so they keep resolving through other signals.
  assert.equal(inferLocation("Our Dublin team is hiring").status, "unknown");
});

test("a country flag settles a city name that two countries share", () => {
  // Dublin is deliberately absent from both city lists — Ohio and California
  // have one — so the flag was the only thing settling these Meta posts.
  const dublin = inferLocation("Hiring a Revenue Accounting Manager for Meta's Finance team in Dublin 🇮🇪");
  assert.equal(dublin.status, "outside-us");
  assert.equal(dublin.label, "Ireland");

  assert.equal(inferLocation("Hiring an accountant in Dublin, Ohio").status, "us");
  assert.equal(inferLocation("We're hiring a Statutory Accounting Manager in Dublin!").status, "unknown");
});

test("a flag reads as a location signal on its own", () => {
  assert.equal(inferLocation("We're hiring a Financial Analyst 🇩🇪 Apply now").status, "outside-us");
  assert.equal(inferLocation("We're hiring a Senior Accountant 🇺🇸").status, "us");
});

test("two flags settle nothing, and the label may not pick one", () => {
  const both = inferLocation("Hiring across 🇺🇸 and 🇬🇧");
  assert.equal(both.status, "unknown");
  assert.equal(both.label, "Location not verified");
});
