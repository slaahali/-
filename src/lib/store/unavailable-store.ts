// What getStore() returns on a serverless host with no database configured (and
// no explicit demo opt-in): the public pages still render, empty, while every
// write and admin call fails with StoreUnavailableError → 503 from the API.

import type { LikeResult, ListResult, PublicMessage } from "../types";
import { StoreUnavailableError } from "./errors";
import type { AdminListResult, AdminRecord, MessageStore, ReportOutcome } from "./types";

const BANNER =
  "\n[store] ✖✖✖ NO DATABASE CONFIGURED ✖✖✖\n" +
  "[store] DATABASE_URL (or POSTGRES_URL) is not set on this serverless deployment.\n" +
  "[store] Letters CANNOT be saved: every write returns 503. Set DATABASE_URL to the\n" +
  "[store] provider's pooled URL — or SEED_DEMO=true / ALLOW_FILE_STORE=1 for a throwaway demo.\n";

const LOG_EVERY_MS = 60_000;

export class UnavailableStore implements MessageStore {
  private lastLog = 0;

  constructor() {
    console.error(BANNER);
  }

  private refuse(op: string): never {
    const now = Date.now();
    if (now - this.lastLog > LOG_EVERY_MS) {
      this.lastLog = now;
      console.error(`[store] refused ${op}: no DATABASE_URL on this deployment (see the banner above).`);
    }
    throw new StoreUnavailableError();
  }

  async get(): Promise<PublicMessage | null> {
    return null;
  }

  async list(): Promise<ListResult> {
    return { items: [], nextCursor: null, total: 0 };
  }

  async count(): Promise<number> {
    return 0;
  }

  /** Only the create path asks, before moderation runs: refuse early. */
  async countRecent(): Promise<number> {
    return this.refuse("create");
  }

  async create(): Promise<PublicMessage> {
    return this.refuse("create");
  }

  async toggleLike(): Promise<LikeResult | null> {
    return this.refuse("like");
  }

  async report(): Promise<ReportOutcome | null> {
    return this.refuse("report");
  }

  async adminList(): Promise<AdminListResult> {
    return this.refuse("admin list");
  }

  async adminUpdate(): Promise<boolean> {
    return this.refuse("admin update");
  }

  async adminDelete(): Promise<boolean> {
    return this.refuse("admin delete");
  }

  async adminExport(): Promise<AdminRecord[]> {
    return this.refuse("admin export");
  }
}
