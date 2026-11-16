/**
 * Multi-tab single-writer lease (spec 22.3). One tab owns the authoritative
 * simulation and is the only writer of the save; extra tabs follow the
 * persisted revision until the owner stops refreshing the lease.
 */

export const LEASE_KEY = "rustwake.lease.v1";

/** A writer that has not refreshed within this window loses the lease. */
export const LEASE_TTL_MS = 1500;

export type LeaseRole = "writer" | "reader";

export interface LeaseRecord {
  readonly owner: string;
  readonly heartbeatMs: number;
  readonly revision: number;
}

export interface LeaseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface Lease {
  readonly id: string;
  /** Last known role; refreshed by `claim`. */
  role(): LeaseRole;
  /** Refreshes our claim, adopts an expired one, or yields to a live owner. */
  claim(revision: number): LeaseRole;
  /** Drops our claim so the next tab can take the lease immediately. */
  release(): void;
  /** Reads and validates the stored record, or null when absent or corrupt. */
  peek(): LeaseRecord | null;
}

let instanceSeq = 0;

export function nextLeaseId(): string {
  instanceSeq += 1;
  return `t${instanceSeq.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createLease(storage: LeaseStorage, now: () => number, id: string): Lease {
  let current: LeaseRole = "reader";

  const lease: Lease = {
    id,
    role: () => current,
    claim(revision: number): LeaseRole {
      const stored = readRecord(storage);
      if (!stored || stored.owner === id || isStale(stored, now())) {
        writeRecord(storage, { owner: id, heartbeatMs: now(), revision });
        current = "writer";
      } else {
        current = "reader";
      }
      return current;
    },
    release() {
      const stored = readRecord(storage);
      if (stored && stored.owner === id && storage.removeItem) {
        try {
          storage.removeItem(LEASE_KEY);
        } catch {
          /* storage unavailable: the lease expires on its own */
        }
      }
      current = "reader";
    },
    peek: () => readRecord(storage),
  };
  return lease;
}

export function isStale(record: LeaseRecord, nowMs: number): boolean {
  return nowMs - record.heartbeatMs >= LEASE_TTL_MS;
}

function readRecord(storage: LeaseStorage): LeaseRecord | null {
  let text: string | null = null;
  try {
    text = storage.getItem(LEASE_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const record = parsed as Partial<LeaseRecord>;
  if (typeof record !== "object" || record === null) return null;
  if (typeof record.owner !== "string" || record.owner.length === 0) return null;
  if (!Number.isFinite(record.heartbeatMs) || (record.heartbeatMs as number) < 0) return null;
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 0) return null;
  return { owner: record.owner, heartbeatMs: record.heartbeatMs as number, revision: record.revision as number };
}

function writeRecord(storage: LeaseStorage, record: LeaseRecord): void {
  try {
    storage.setItem(LEASE_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable: the session still runs in memory */
  }
}
