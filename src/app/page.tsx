import { redirect } from "next/navigation";

export default function RootPage() {
  // Middleware enforces auth on /dashboard; this just routes `/` there.
  redirect("/dashboard");
}
