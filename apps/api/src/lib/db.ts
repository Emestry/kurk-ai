import type { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";

export type DbClient = Prisma.TransactionClient;

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
