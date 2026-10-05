// The analytics board lives on the Data & Analytics tab; this keeps old /analytics links working.
import { redirect } from "next/navigation";

export default function AnalyticsPage() {
  redirect("/data#analytics");
}
