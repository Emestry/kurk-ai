import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { getEnv } from "./env.js";

const env = getEnv();

export const prisma = new PrismaClient({
  adapter: new PrismaPg(
    {
      connectionString: env.databaseUrl,
    },
    {
      schema: env.databaseSchema,
    },
  ),
});
