import type { Entry, Profile } from "@medilog/engine";

// Local-first, encrypted at rest. Records are AES-256-GCM encrypted with a
// non-extractable key that lives in this browser's IndexedDB: the key cannot
// be exported by page script, and nothing is stored on a server.

export interface Settings {
  engine: "auto" | "local";
  region: "AU" | "US";
}

export interface AppState {
  profile: Profile;
  entries: Entry[];
  settings: Settings;
}

const STORAGE_KEY = "medilog:vault:v1";
const DB_NAME = "medilog-keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deviceKey(): Promise<CryptoKey | null> {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) return null;
  try {
    const db = await openDb();
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const req = db.transaction("keys").objectStore("keys").get("device");
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(key, "device");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return key;
  } catch {
    return null;
  }
}

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface VaultInfo {
  encrypted: boolean;
  bytes: number;
}

export async function saveState(state: AppState): Promise<VaultInfo> {
  const json = JSON.stringify(state);
  const key = await deviceKey();
  let payload: string;
  if (key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(json));
    payload = JSON.stringify({ alg: "AES-256-GCM", iv: b64(iv), data: b64(data) });
  } else {
    payload = JSON.stringify({ alg: "none", data: json });
  }
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // Storage blocked (private mode): the demo still runs in memory.
  }
  return { encrypted: !!key, bytes: payload.length };
}

export async function loadState(): Promise<AppState | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { alg: string; iv?: string; data: string };
    if (parsed.alg === "none") return JSON.parse(parsed.data) as AppState;
    const key = await deviceKey();
    if (!key || !parsed.iv) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(parsed.iv) }, key, unb64(parsed.data));
    return JSON.parse(new TextDecoder().decode(plain)) as AppState;
  } catch {
    return null;
  }
}

/** A peek at what is actually sitting in browser storage, for the demo panel. */
export function rawVaultPreview(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { data: string };
    return parsed.data.slice(0, 120);
  } catch {
    return "";
  }
}

export function wipeState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing stored */
  }
}
