import type { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";

export type DbClient = Prisma.TransactionClient;

export async function withDbTransaction<T>(
  callback: (db: DbClient) => Promise<T>,
) {
  return prisma.$transaction((tx) => callback(tx));
}
