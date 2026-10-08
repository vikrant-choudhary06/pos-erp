import { Prisma } from '@prisma/client';

/**
 * Next value of a per-outlet counter. The upsert is a single statement, so
 * two tills asking at once still get different numbers. Inside a transaction
 * the increment rolls back with it, which keeps invoice numbers gap-free.
 */
export async function nextNumber(db: Prisma.TransactionClient, outletId: string, key: string) {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("outletId", "key", "value")
    VALUES (${outletId}::uuid, ${key}, 1)
    ON CONFLICT ("outletId", "key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}
