import "./globals.css";
import type { Metadata } from "next";
import { SideNav } from "../components/SideNav";
import { TopBar } from "../components/TopBar";
import { preferredBusiness } from "@/lib/current";
import { activeDepartments } from "@/lib/profile";
import { resolveCurrent } from "@/lib/store";

export const metadata: Metadata = {
  title: "HQ",
  description: "Every business function, staffed with free tools and installed Claude skills, run by a CEO view.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const business = resolveCurrent(preferredBusiness());
  return (
    <html lang="en">
      <body className="min-h-screen text-bb-fg font-sans flex">
        <SideNav active={activeDepartments(business)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar />
          <main className="flex-1 min-w-0 px-6 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
