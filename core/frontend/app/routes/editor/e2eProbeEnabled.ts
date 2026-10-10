/** Compile-time feature gate shared by probe contributors. */
export function isE2EProbeEnabled(): boolean {
  return import.meta.env.VITE_STA_E2E_PROBE === "1";
}
