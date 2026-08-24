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
