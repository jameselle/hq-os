// How each platform gets posted to. A business profile lists its channels; each
// channel takes the platform's default route unless the profile says `via`.
// The traps below were each learnt the hard way in an earlier project and are
// what /hq:publish must respect. Client-safe: no node imports.

export const ROUTES = ["composio", "woopsocial", "postiz", "manual"] as const;
export type Route = (typeof ROUTES)[number];

export type PlatformRoute = {
  via: Route;
  /** Composio toolkit slug the route runs through (WoopSocial is itself a Composio toolkit). */
  toolkit?: string;
  /** The tool calls, in order. */
  tools?: string[];
  traps?: string[];
};

export type Platform = {
  label: string;
  /** First route is the default; the rest are known alternatives. */
  routes: PlatformRoute[];
};

const COMPOSIO_UPLOAD_NOTE =
  "Through the Composio MCP connector, media must be a public URL the platform can fetch (a GitHub release asset in a public repo is proven). Local files need the Composio SDK instead.";

export const PLATFORMS: Record<string, Platform> = {
  instagram: {
    label: "Instagram",
    routes: [
      {
        via: "composio",
        toolkit: "instagram",
        tools: ["INSTAGRAM_POST_IG_USER_MEDIA", "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", "INSTAGRAM_GET_IG_MEDIA"],
        traps: [
          "POST_IG_USER_MEDIA returns a container id, not the post id. Creating a container without publishing is a safe dry run (it expires in ~24 h).",
          "Reels: media_type=REELS. Carousels use INSTAGRAM_CREATE_CAROUSEL_CONTAINER.",
          "Insights live on INSTAGRAM_GET_IG_MEDIA_INSIGHTS; asking the media node for view fields fails the whole request.",
          COMPOSIO_UPLOAD_NOTE,
        ],
      },
      { via: "woopsocial", toolkit: "woop_social" },
    ],
  },
  youtube: {
    label: "YouTube",
    routes: [
      {
        via: "composio",
        toolkit: "youtube",
        tools: ["YOUTUBE_MULTIPART_UPLOAD_VIDEO", "YOUTUBE_GET_VIDEO_DETAILS_BATCH"],
        traps: [
          "Plain YOUTUBE_UPLOAD_VIDEO creates a record YouTube deletes ~10 s later. Use a resumable upload through the Composio proxy (POST /upload/youtube/v3/videos?uploadType=resumable, then PUT the bytes to the returned Location).",
          "Verify with GET_VIDEO_DETAILS: processingStatus must reach 'succeeded' and fileDetails must exist; a missing video means it was deleted.",
        ],
      },
    ],
  },
  pinterest: {
    label: "Pinterest",
    routes: [
      {
        via: "composio",
        toolkit: "pinterest",
        tools: ["PINTEREST_LIST_BOARDS", "PINTEREST_CREATE_PIN"],
        traps: ["Needs a board id: list boards first. Images can go as base64."],
      },
    ],
  },
  tiktok: {
    label: "TikTok",
    routes: [
      {
        via: "woopsocial",
        toolkit: "woop_social",
        tools: ["WOOP_SOCIAL_UPLOAD_MEDIA", "WOOP_SOCIAL_VALIDATE_POST", "WOOP_SOCIAL_PUBLISH_POST_NOW", "WOOP_SOCIAL_GET_POST"],
        traps: [
          "WoopSocial is an audited TikTok partner, so posts can be public; TikTok's own API limits unaudited apps to private posts.",
          "UPLOAD_MEDIA returns `media_id` (not media.id). VALIDATE_POST is a safe dry run.",
          "Learn which TikTok video a post became ONLY from WOOP_SOCIAL_GET_POST's external_post_id/url. Never match by time or caption: that crossed 10 of 16 posts once.",
          "Set is_ai_generated_content for AI-made video.",
        ],
      },
      {
        via: "composio",
        toolkit: "tiktok",
        tools: ["TIKTOK_UPLOAD_VIDEO", "TIKTOK_PUBLISH_VIDEO", "TIKTOK_FETCH_PUBLISH_STATUS"],
        traps: ["Unaudited apps can only post privately (unaudited_client_can_only_post_to_private_accounts). Treat a nested error as failure even when successful=true."],
      },
    ],
  },
  facebook: {
    label: "Facebook",
    routes: [
      {
        via: "composio",
        toolkit: "facebook",
        tools: ["FACEBOOK_LIST_MANAGED_PAGES", "FACEBOOK_CREATE_POST", "FACEBOOK_CREATE_PHOTO_POST"],
        traps: ["Posts go to a Page, not a profile. Images must be publicly fetchable. Page responses can contain tokens: never log them."],
      },
    ],
  },
  linkedin: {
    label: "LinkedIn",
    routes: [
      {
        via: "composio",
        toolkit: "linkedin",
        tools: ["LINKEDIN_GET_MY_INFO", "LINKEDIN_CREATE_LINKED_IN_POST"],
        traps: ["~3,000 character limit. Company-page posting needs org permissions."],
      },
    ],
  },
  x: {
    label: "X",
    routes: [
      {
        via: "composio",
        toolkit: "twitter",
        tools: ["TWITTER_UPLOAD_MEDIA", "TWITTER_CREATION_OF_A_POST", "TWITTER_POST_LOOKUP_BY_POST_ID"],
        traps: [
          "Weighted 280 limit (emoji and URLs count differently).",
          "Not idempotent: after a timeout, look the post up before retrying or it double-posts.",
        ],
      },
      { via: "woopsocial", toolkit: "woop_social", traps: ["X posts use WoopSocial credits after the first few."] },
    ],
  },
  discord: { label: "Discord", routes: [{ via: "postiz", traps: ["Needs only a bot token in Postiz; no platform review."] }] },
  telegram: { label: "Telegram", routes: [{ via: "postiz", traps: ["Needs only a bot token in Postiz."] }] },
  reddit: { label: "Reddit", routes: [{ via: "postiz" }] },
  bluesky: { label: "Bluesky", routes: [{ via: "postiz" }] },
  threads: { label: "Threads", routes: [{ via: "postiz", traps: ["Postiz needs your own Meta app for Threads."] }] },
  mastodon: { label: "Mastodon", routes: [{ via: "postiz" }] },
};

/** A channel as a profile states it: a bare handle, or a handle with an explicit route and account. */
export type ChannelSpec = string | { handle: string; via?: Route; account?: string };

export function channelHandle(spec: ChannelSpec): string {
  return typeof spec === "string" ? spec : spec.handle;
}

/** The route a channel will use: the profile's `via`, else the platform default, else manual. */
export function resolveRoute(platform: string, spec: ChannelSpec): PlatformRoute {
  const p = PLATFORMS[platform];
  const via = typeof spec === "object" ? spec.via : undefined;
  if (!p) return { via: via ?? "manual" };
  if (!via) return p.routes[0];
  return p.routes.find((r) => r.via === via) ?? { via };
}

// ---------- connection snapshot (written by /hq:connections, never contains secrets) ----------

export type ConnectionAccount = { id: string; alias?: string; name?: string; status: string };
export type ConnectionsSnapshot = {
  checkedAt: string;
  source: string; // e.g. "composio-mcp"
  toolkits: Record<string, { status: string; accounts: ConnectionAccount[] }>;
};

const SECRETISH = /token|secret|password|api[_-]?key|bearer/i;

/** Validate a snapshot and refuse anything that looks like it carries credentials. */
export function validateSnapshot(raw: unknown): { ok: true; snapshot: ConnectionsSnapshot } | { ok: false; error: string } {
  const text = JSON.stringify(raw ?? null);
  if (SECRETISH.test(text)) return { ok: false, error: "snapshot looks like it contains credentials; save only ids, aliases, names and statuses" };
  const s = raw as ConnectionsSnapshot;
  if (!s || typeof s !== "object" || typeof s.checkedAt !== "string" || Number.isNaN(Date.parse(s.checkedAt)))
    return { ok: false, error: "checkedAt: ISO date required" };
  if (typeof s.toolkits !== "object" || s.toolkits === null) return { ok: false, error: "toolkits: object required" };
  for (const [k, v] of Object.entries(s.toolkits)) {
    if (typeof v?.status !== "string" || !Array.isArray(v.accounts)) return { ok: false, error: `toolkits.${k}: needs status and accounts[]` };
    for (const a of v.accounts) if (typeof a?.id !== "string" || typeof a?.status !== "string") return { ok: false, error: `toolkits.${k}: every account needs id and status` };
  }
  return { ok: true, snapshot: { ...s, source: s.source || "composio-mcp" } };
}

export type ChannelState = "connected" | "not-connected" | "via-postiz" | "manual" | "unknown";

export type ChannelStatus = {
  platform: string;
  label: string;
  handle: string;
  via: Route;
  toolkit?: string;
  account?: string;
  state: ChannelState;
  detail: string;
};

/** Where each of a business's channels stands, given the latest connection snapshot. */
export function channelStatuses(
  channels: Record<string, ChannelSpec>,
  snapshot: ConnectionsSnapshot | null,
  postizUp: boolean,
): ChannelStatus[] {
  return Object.entries(channels).map(([platform, spec]) => {
    const route = resolveRoute(platform, spec);
    const account = typeof spec === "object" ? spec.account : undefined;
    const base = { platform, label: PLATFORMS[platform]?.label ?? platform, handle: channelHandle(spec), via: route.via, toolkit: route.toolkit, account };
    if (route.via === "manual") return { ...base, state: "manual" as const, detail: "posted by hand" };
    if (route.via === "postiz")
      return { ...base, state: "via-postiz" as const, detail: postizUp ? "Postiz is running; connect the channel inside Postiz" : "Postiz is down" };
    if (!snapshot) return { ...base, state: "unknown" as const, detail: "no connection snapshot yet: run /hq:connections" };
    const tk = route.toolkit ? snapshot.toolkits[route.toolkit] : undefined;
    const active = (tk?.accounts ?? []).filter((a) => a.status.toLowerCase() === "active");
    if (!active.length) return { ...base, state: "not-connected" as const, detail: `no active ${route.toolkit} connection` };
    // Never assume which account is this business's: it must be pinned in the profile, or its
    // platform name must match the channel's handle. Another business's account is not ours.
    const norm = (x?: string) => (x ?? "").toLowerCase().replace(/^@/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
    const who = account
      ? active.find((a) => a.id === account || a.alias === account)
      : active.find((a) => norm(a.name) !== "" && norm(a.name) === norm(base.handle));
    if (!who) {
      const others = active.map((a) => a.name ?? a.alias ?? a.id).join(", ");
      return {
        ...base,
        state: "not-connected" as const,
        detail: account
          ? `account ${account} isn't among the active ${route.toolkit} connections (${others})`
          : `no connected ${route.toolkit} account is ${base.handle} (connected: ${others}, which belong to other businesses unless you say otherwise); connect ${base.handle} with /hq:connections`,
      };
    }
    return { ...base, state: "connected" as const, detail: `${route.toolkit}: ${who.name ?? who.alias ?? who.id}` };
  });
}
