import { getPublicEnvForInjection } from "@/lib/env/publicConfig";

/** Injects public env into the page before client bundles run. */
export function PublicEnvScript() {
  const env = getPublicEnvForInjection();
  const json = JSON.stringify(env).replace(/</g, "\\u003c");
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__BETESE_ENV__=${json};`,
      }}
    />
  );
}
