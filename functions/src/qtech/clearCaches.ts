import { clearQTechAccessTokenCache } from "./auth";
import { clearQTechSettingsCache } from "./config";
import { clearDemoLaunchCache } from "./runtimeCache";

/** Drop every warm QTech in-memory cache after credential / environment changes. */
export function clearAllQTechRuntimeCaches(): void {
  clearQTechSettingsCache();
  clearQTechAccessTokenCache();
  clearDemoLaunchCache();
}
