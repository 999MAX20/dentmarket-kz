import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_TESTCONTAINERS === "1";
const postgresImage = process.env.TESTCONTAINERS_POSTGRES_IMAGE ?? "postgres:17-alpine";

describe.runIf(enabled)("PostgreSQL reservation concurrency", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(postgresImage).withDatabase("marketplace_test").start();
  }, 180_000);

  afterAll(async () => { await container?.stop(); }, 30_000);

  it("allows only one conditional reservation to consume scarce stock", async () => {
    const setup = new Client({ connectionString: container.getConnectionUri() });
    await setup.connect();
    await setup.query('CREATE TABLE inventory (id UUID PRIMARY KEY, available INTEGER NOT NULL CHECK (available >= 0))');
    await setup.query("INSERT INTO inventory(id, available) VALUES ('00000000-0000-4000-8000-000000000001', 10)");
    await setup.end();

    const first = new Client({ connectionString: container.getConnectionUri() });
    const second = new Client({ connectionString: container.getConnectionUri() });
    await Promise.all([first.connect(), second.connect()]);
    const reserve = (client: Client) => client.query("UPDATE inventory SET available = available - 7 WHERE id = '00000000-0000-4000-8000-000000000001' AND available >= 7 RETURNING available");
    const results = await Promise.all([reserve(first), reserve(second)]);
    expect(results.map(({ rowCount }) => rowCount).sort()).toEqual([0, 1]);
    const final = await first.query<{ available: number }>("SELECT available FROM inventory");
    expect(final.rows[0]?.available).toBe(3);
    await Promise.all([first.end(), second.end()]);
  }, 30_000);
});
