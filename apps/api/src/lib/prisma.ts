import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { __mvPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__mvPrisma ?? createPrismaClient(process.env.DATABASE_URL ?? "");

if (process.env.NODE_ENV !== "production") globalForPrisma.__mvPrisma = prisma;

export type { PrismaClient };
export * as DB from "../generated/prisma/client.js";
