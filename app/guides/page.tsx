// Guides: step-by-step setup docs from this repo, readable inside HQ. Each is written so an owner can follow it
// alone, or tell Claude "set up HQ" (/hq:setup) and be walked through it.
import Link from "next/link";

import { CopyCommand } from "@/components/Controls";
import { GUIDES, GUIDE_KINDS, type GuideKind } from "@/lib/guides";

export default function GuidesPage() {
  const kinds = Object.keys(GUIDE_KINDS) as GuideKind[];
  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow mb-1">Lead</div>
        <h1 className="text-2xl font-semibold">Guides</h1>
        <p className="mt-1 max-w-[78ch] text-[13px] text-bb-muted">
          How to set up every part of HQ, step by step. Follow a guide yourself, or tell Claude <strong>&ldquo;set up HQ&rdquo;</strong> and it
          walks you through them in order, checking what&rsquo;s already done and asking only for what only you can do.
        </p>
      </div>
      <section className="card p-3">
        <div className="flex flex-wrap gap-2">
          <CopyCommand command="/hq:setup" label="Walk me through setup" blurb="/hq:setup in Claude Code" />
          <CopyCommand command="/hq:setup what's left to set up?" label="What's left?" blurb="/hq:setup what's left" />
          <CopyCommand command="/hq:new-business" label="Add a business" blurb="/hq:new-business" />
        </div>
      </section>
      {kinds.map((kind) => (
        <section key={kind} className="space-y-2">
          <div className="eyebrow">{GUIDE_KINDS[kind]}</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {GUIDES.filter((g) => g.kind === kind).map((g) => (
              <Link key={g.slug} href={`/guides/${g.slug}`} className="card p-4 hover:bg-bb-surface">
                <div className="text-[14px] font-semibold">{g.title}</div>
                <p className="mt-1 text-[12px] text-bb-muted line-clamp-3">{g.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
