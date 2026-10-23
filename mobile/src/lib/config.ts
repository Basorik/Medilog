import { configureRelay } from "@medilog/engine";

/**
 * Optional URL of the Medilog relay (the `server/` in the repo root), set at
 * build time. Unset, the app is fully on-device and never makes a network call.
 */
export const RELAY_URL = (process.env.EXPO_PUBLIC_MEDILOG_RELAY_URL ?? "").trim();

if (RELAY_URL) configureRelay(RELAY_URL);
