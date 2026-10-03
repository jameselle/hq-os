// One guide, rendered from its doc. Only docs listed in lib/guides.ts can be opened.
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GuideMarkdown } from "@/components/GuideMarkdown";
import { guideBySlug } from "@/lib/guides";
import { hqRoot } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const markdown = fs.readFileSync(path.join(hqRoot(), guide.file), "utf8");
  return (
    <div className="space-y-3">
      <Link href="/guides" className="text-[12px] text-bb-muted hover:text-bb-fg">← Guides</Link>
      <article className="card p-5 prose-brief text-[13.5px] max-w-[88ch]">
        <GuideMarkdown markdown={markdown} />
      </article>
    </div>
  );
}
