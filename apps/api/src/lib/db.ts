import type { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";

export type DbClient = Prisma.TransactionClient;

/**
 * Runs a callback inside a Prisma transaction with relaxed timeouts for remote
 * database latency.
 *
 * @param callback - Async work that should execute against a transaction client.
 * @returns The callback result once the transaction commits successfully.
 * @throws Any error raised by Prisma or the callback while the transaction is running.
 */
export async function withDbTransaction<T>(
  callback: (db: DbClient) => Promise<T>,
) {
  return prisma.$transaction((tx) => callback(tx), {
    // Remote Postgres latency pushes guest-request creation (parse + item
    // lookup + insert + reservations + movements) past Prisma's 5s default.
    maxWait: 15_000,
    timeout: 30_000,
  });
}
