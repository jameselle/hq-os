// Regulated-industry flags -> standing notes per department. Replaces the
// business-specific warnings that used to be hard-coded, so any business
// gets the right warnings from its profile. Notes point at the rule and say
// "check"; they are prompts for a real review, not legal advice.
// Client-safe: no node imports.

import type { Profile, RegulatedFlag } from "./profile";

type Notes = Partial<Record<string, string[]>>; // department slug -> notes

const GENERIC: Record<RegulatedFlag, Notes> = {
  gambling: {
    ads: ["Google and Meta only run gambling ads for certified or approved advertisers; expect organic channels to carry growth until approved."],
    legal: ["Gambling promotion is regulated almost everywhere: check local licensing, responsible-gambling messaging and inducement rules before publishing."],
    content: ["Platforms restrict gambling content (age-gating, no targeting minors). Check each platform's policy before posting."],
  },
  kids: {
    content: ["Content for children: YouTube requires 'made for kids' labelling, which disables comments and personalised ads."],
    legal: ["Children's privacy law applies (e.g. COPPA in the US). Don't collect personal data from children without verified parental consent."],
    data: ["Analytics on child-directed pages must avoid personal data and cross-site tracking."],
    ads: ["Most ad platforms ban personalised ads to children; target parents instead."],
  },
  finance: {
    legal: ["Financial products and advice are licensed activities; general information needs clear 'not advice' wording."],
    content: ["No return promises or testimonials implying outcomes without a compliance check."],
  },
  health: {
    legal: ["Health claims need evidence and are regulated; check the local therapeutic-goods advertising rules."],
    content: ["Avoid cure or treatment claims in posts and ads."],
  },
  alcohol: {
    ads: ["Alcohol ads must be age-gated and can't target under-age audiences."],
    legal: ["Check the local responsible alcohol marketing code."],
  },
  adult: {
    ads: ["Most mainstream ad platforms don't accept adult content."],
    legal: ["Age verification rules apply in many jurisdictions."],
  },
};

/** Country-specific additions, keyed by ISO code. Kept short and checkable. */
const BY_COUNTRY: Record<string, Partial<Record<RegulatedFlag, Notes>>> = {
  AU: {
    gambling: {
      legal: ["Australia: Interactive Gambling Act, enforced by ACMA. Check the rules on in-play betting, inducements and advertising before launch."],
      ads: ["Australia: gambling ads face timing and content restrictions; Google's gambling certification in AU generally needs a licensed wagering operator."],
    },
    kids: { legal: ["Australia: the OAIC is developing a Children's Online Privacy Code under the Privacy Act; watch for it."] },
    finance: { legal: ["Australia: financial product advice generally needs an AFSL (ASIC)."] },
    health: { legal: ["Australia: the TGA's Therapeutic Goods Advertising Code applies."] },
    alcohol: { legal: ["Australia: the ABAC Responsible Alcohol Marketing Code applies."] },
  },
};

/** Standing notes for one department, from the profile's flags, country and own notes. */
export function departmentNotes(profile: Profile | null, dept: string): string[] {
  if (!profile) return [];
  const out: string[] = [];
  for (const flag of profile.regulated) {
    out.push(...(GENERIC[flag]?.[dept] ?? []));
    out.push(...(BY_COUNTRY[profile.country]?.[flag]?.[dept] ?? []));
  }
  out.push(...(profile.departments?.notes?.[dept] ?? []));
  return out;
}
