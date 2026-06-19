import { redirect } from "next/navigation";

/** Legacy route — QTech control lives on /admin/qtech. */
export default function AdminGamesRedirect() {
  redirect("/admin/qtech");
}
