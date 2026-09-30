/** Thrown by writes (and admin reads) when no database is configured on a serverless host. */
export class StoreUnavailableError extends Error {
  constructor(message = "store unavailable: no DATABASE_URL configured") {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

/** A public read failed (database down, pool exhausted…) — not the same as "not found". */
export class DataUnavailableError extends Error {
  constructor(context: string) {
    super(`${context}: data unavailable`);
    this.name = "DataUnavailableError";
  }
}
