import { redirect } from "next/navigation";

// The CEO is the front door.
export default function Home() {
  redirect("/ceo");
}
