import type { Entry } from "@medilog/engine";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

// On-device encrypted journal. SQLCipher encrypts the whole database file
// with a random 256-bit key that lives only in the iOS Keychain / Android
// Keystore and never leaves this device (not even in backups).

const DB_NAME = "medilog.db";
const KEY_NAME = "medilog.dbkey.v1";
const KEY_OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface VaultInfo {
  encrypted: boolean;
  /** True when an old journal could not be unlocked (e.g. restored onto a new phone) and was reset. */
  reset: boolean;
}

let db: SQLite.SQLiteDatabase | null = null;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

async function deviceKey(): Promise<{ key: string; isNew: boolean }> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTS);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return { key: existing, isNew: false };
  const key = toHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(KEY_NAME, key, KEY_OPTS);
  return { key, isNew: true };
}

async function openWithKey(key: string) {
  const handle = await SQLite.openDatabaseAsync(DB_NAME);
  // Raw-key form; the key is generated hex, so interpolating it is safe.
  await handle.execAsync(`PRAGMA key = "x'${key}'";`);
  // Fails here, not later, if the key does not match the file.
  await handle.getFirstAsync("SELECT count(*) FROM sqlite_master");
  await handle.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `);
  return handle;
}

export async function openVault(): Promise<VaultInfo> {
  if (db) return { encrypted: true, reset: false };
  const { key, isNew } = await deviceKey();
  try {
    db = await openWithKey(key);
    return { encrypted: true, reset: false };
  } catch (err) {
    // Only when the key is gone (app reinstalled, or the file restored onto a
    // new phone) is the old file unreadable by design; then start afresh.
    // Any other failure is surfaced rather than risking the user's data.
    if (!isNew || !/not a database/i.test(String(err))) throw err;
    await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);
    db = await openWithKey(key);
    return { encrypted: true, reset: true };
  }
}

const handle = () => {
  if (!db) throw new Error("vault not open");
  return db;
};

export async function loadEntries(): Promise<Entry[]> {
  const rows = await handle().getAllAsync<{ json: string }>("SELECT json FROM entries ORDER BY created_at");
  return rows.map((r) => JSON.parse(r.json) as Entry);
}

export async function putEntry(e: Entry) {
  await handle().runAsync("INSERT OR REPLACE INTO entries (id, created_at, json) VALUES (?, ?, ?)", e.id, e.createdAt, JSON.stringify(e));
}

export async function deleteEntry(id: string) {
  await handle().runAsync("DELETE FROM entries WHERE id = ?", id);
}

export async function replaceAllEntries(entries: Entry[]) {
  const d = handle();
  await d.withTransactionAsync(async () => {
    await d.runAsync("DELETE FROM entries");
    for (const e of entries) await d.runAsync("INSERT INTO entries (id, created_at, json) VALUES (?, ?, ?)", e.id, e.createdAt, JSON.stringify(e));
  });
}

export async function getValue<T>(key: string): Promise<T | null> {
  const row = await handle().getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function setValue(key: string, value: unknown) {
  await handle().runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", key, JSON.stringify(value));
}

/** Deletes the journal and its key. Irreversible. */
export async function wipeVault() {
  await db?.closeAsync();
  db = null;
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);
  await SecureStore.deleteItemAsync(KEY_NAME, KEY_OPTS);
}
