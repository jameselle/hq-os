"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { DEPARTMENTS } from "@/lib/registry";

// The HQ shell's side navigation: collapsible rail, brand block,
// mono eyebrow, glyph + label rows. The CEO leads; the departments follow in
// the order a business usually stands them up.
const LEAD = [
  { href: "/ceo", label: "CEO", glyph: "✦" },
  { href: "/dashboard", label: "Dashboard", glyph: "▦" },
  { href: "/campaigns", label: "Campaigns", glyph: "◎" },
  { href: "/workflows", label: "Workflows", glyph: "⇄" },
  { href: "/guides", label: "Guides", glyph: "?" },
];


/** Pages that live under a department, shown indented beneath it. */
const SUB: Record<string, { href: string; label: string }> = {
  competitors: { href: "/competitors/trends", label: "Trend Radar" },
  sales: { href: "/sales/partners", label: "Partnerships" },
};

const STORAGE_KEY = "hq.sidenav.collapsed";

/** `built`: undefined for lead items; a reason string when the department is built out; null when it isn't yet. */
function NavLink({
  item,
  active,
  collapsed,
  built,
}: {
  item: { href: string; label: string; glyph: string };
  active: boolean;
  collapsed: boolean;
  built?: string | null;
}) {
  const dim = built === null && !active;
  return (
    <Link
      href={item.href}
      title={built === undefined ? item.label : built ? `${item.label}: built out (${built})` : `${item.label}: not built out yet for this business`}
      className={`relative flex items-center gap-2.5 rounded-lg text-[13px] transition-colors ${
        collapsed ? "justify-center px-0 py-1.5" : "px-2.5 py-1.5"
      } ${
        active
          ? "bg-bb-blue/10 text-bb-fg border border-bb-blue/25"
          : dim
            ? "text-bb-dim opacity-60 hover:opacity-100 hover:bg-bb-surface hover:text-bb-fg border border-transparent"
            : `${built ? "text-bb-fg" : "text-bb-muted"} hover:bg-bb-surface hover:text-bb-fg border border-transparent`
      }`}
    >
      <span className={`w-3.5 shrink-0 text-center ${active ? "text-bb-blue" : built ? "text-bb-accent" : "text-bb-dim"}`}>{item.glyph}</span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {built && (collapsed
        ? <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-bb-accent" />
        : <span aria-label="built out" className="h-1.5 w-1.5 shrink-0 rounded-full bg-bb-accent" />)}
    </Link>
  );
}

/** `active`: department slugs the current business runs (skipped ones are hidden). `built`: the ones built out for it
 *  (lib/built.ts), with why; the rest show dimmed. */
export function SideNav({ active, built = {} }: { active: string[]; built?: Record<string, string> }) {
  const path = usePathname();
  // Lifecycle lives inside Email & Lifecycle, so the departments are the whole list.
  const NAV = DEPARTMENTS.filter((d) => active.includes(d.slug)).map((d) => ({ href: `/${d.slug}`, label: d.label, glyph: d.glyph, slug: d.slug }));
  const lead = LEAD;
  // Starts expanded on server and client alike (no hydration mismatch); the
  // stored preference is applied after mount.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.innerWidth < 640 || window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage unavailable: stay expanded.
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // The toggle still works for this session.
      }
      return next;
    });
  }

  const isActive = (href: string) => path === href || path.startsWith(`${href}/`);

  return (
    <aside
      id="app-sidenav"
      className={`shrink-0 border-r border-bb-border/80 py-4 flex flex-col gap-1 bg-gradient-to-b from-[#0a0f1c] to-[#070b14] min-h-screen transition-[width] duration-200 ease-out motion-reduce:transition-none ${
        collapsed ? "w-14 px-1.5" : "w-[228px] px-3"
      }`}
    >
      <div className={`flex pb-2 ${collapsed ? "justify-center" : "justify-end"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="app-sidenav"
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-bb-dim transition-colors hover:bg-bb-surface hover:text-bb-fg"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Brand */}
      <Link
        href="/ceo"
        title="HQ"
        className={`flex items-center gap-2.5 pt-1 pb-4 ${collapsed ? "justify-center px-0" : "px-2"}`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-bb-blue/30 to-bb-violet/20 border border-bb-blue/30 text-bb-blue text-sm shadow-glow">
          ✦
        </span>
        {!collapsed && (
          <span className="leading-tight">
            <span className="block font-bold text-[15px] tracking-tight">
              HQ<span className="text-bb-teal">.</span>
            </span>
            <span className="block text-[8.5px] tracking-[0.18em] uppercase text-bb-dim font-mono">
              Business Operations
            </span>
          </span>
        )}
      </Link>

      <div className="mt-2 mb-2 px-2.5">{!collapsed && <span className="eyebrow text-bb-dim">Lead</span>}</div>
      {lead.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
      ))}

      <div className="mt-4 mb-2 px-2.5">{!collapsed && <span className="eyebrow text-bb-dim">Departments</span>}</div>
      {NAV.map((item) => (
        <Fragment key={item.href}>
          <NavLink item={item} active={isActive(item.href) && !(SUB[item.slug] && isActive(SUB[item.slug].href))} collapsed={collapsed} built={built[item.slug] ?? null} />
          {SUB[item.slug] && !collapsed && (
            <Link
              href={SUB[item.slug].href}
              className={`ml-6 flex items-center gap-2 rounded-lg px-2.5 py-1 text-[12px] transition-colors border ${
                isActive(SUB[item.slug].href) ? "bg-bb-blue/10 text-bb-fg border-bb-blue/25" : "text-bb-muted hover:bg-bb-surface hover:text-bb-fg border-transparent"
              }`}
            >
              <span aria-hidden className="text-bb-dim">└</span>
              <span className="min-w-0 flex-1 truncate">{SUB[item.slug].label}</span>
            </Link>
          )}
        </Fragment>
      ))}
      {!collapsed && Object.keys(built).length > 0 && (
        <p className="mt-2 px-2.5 text-[10.5px] text-bb-dim">
          <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-bb-accent align-middle" />built out for this business · dimmed: not yet
        </p>
      )}

      {!collapsed && (
        <div className="mt-auto px-2.5 pt-5 pb-1 text-[9.5px] leading-relaxed text-bb-dim font-mono">
          Free tools only (open source
          <br />
          first) + installed Claude skills.
          <br />
          Checked live on this Mac.
        </div>
      )}
    </aside>
  );
}
