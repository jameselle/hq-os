// /partners is a shortcut: Partnerships lives under Sales & Partnerships.
import { redirect } from "next/navigation";

export default function PartnersShortcut() {
  redirect("/sales/partners");
}
