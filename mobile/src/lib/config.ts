import { configureRelay } from "@medilog/engine";

/**
 * Optional URL of the Medilog relay (the `server/` in the repo root), set at
 * build time. Unset, the app is fully on-device and never makes a network call.
 */
export const RELAY_URL = (process.env.EXPO_PUBLIC_MEDILOG_RELAY_URL ?? "").trim();

/**
 * Shared beta access token for the relay. It ships inside the app, so it is a
 * gate against casual misuse rather than a secret; rotate it by redeploying.
 */
const RELAY_TOKEN = (process.env.EXPO_PUBLIC_MEDILOG_RELAY_TOKEN ?? "").trim();

if (RELAY_URL) configureRelay(RELAY_URL, RELAY_TOKEN);
