import { redirect } from "next/navigation";

/** Skip the client auth spinner — old WebViews used to freeze here forever. Keeps the query (e.g. ?mk=, ?ref=). */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, one);
  }
  const qs = params.toString();
  redirect(qs ? `/play?${qs}` : "/play");
}
