import { redirect } from "next/navigation";

/** Skip the client auth spinner — old WebViews used to freeze here forever. */
export default function Home() {
  redirect("/play");
}
