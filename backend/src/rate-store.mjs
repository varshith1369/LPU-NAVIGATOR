// Shared counters preserve login/message limits across serverless instances.
export class PostgresRateStore {
  localKeys = false;
  constructor(db, bucket) {
    this.db = db;
    this.bucket = bucket;
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  async increment(key) {
    const { rows } = await this.db.query(
      `INSERT INTO request_rate_limits(bucket,client_key,hits,reset_at)
      VALUES($1,$2,1,now()+$3::double precision*interval '1 millisecond')
      ON CONFLICT(bucket,client_key) DO UPDATE SET
      hits=CASE WHEN request_rate_limits.reset_at<=now() THEN 1 ELSE request_rate_limits.hits+1 END,
      reset_at=CASE WHEN request_rate_limits.reset_at<=now() THEN excluded.reset_at ELSE request_rate_limits.reset_at END
      RETURNING hits,reset_at`,
      [this.bucket, key, this.windowMs],
    );
    return { totalHits: rows[0].hits, resetTime: new Date(rows[0].reset_at) };
  }
  async decrement(key) {
    await this.db.query(
      "UPDATE request_rate_limits SET hits=greatest(0,hits-1) WHERE bucket=$1 AND client_key=$2",
      [this.bucket, key],
    );
  }
  async resetKey(key) {
    await this.db.query(
      "DELETE FROM request_rate_limits WHERE bucket=$1 AND client_key=$2",
      [this.bucket, key],
    );
  }
}
