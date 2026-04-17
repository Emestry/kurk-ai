import "dotenv/config";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/prisma.js";

interface SeedInventoryItem {
  id: number;
  name: string;
  category: "housekeeping" | "room_service" | "maintenance" | "reception";
  unit: string;
  quantity_in_stock: number;
  low_stock_threshold: number;
}

interface SeedData {
  inventory: SeedInventoryItem[];
  rooms: string[];
}

const seedDirectory = fileURLToPath(new URL(".", import.meta.url));

function roomCodeFromNumber(roomNumber: string) {
  return `ROOM-${roomNumber}`;
}

function roomTokenFromNumber(roomNumber: string) {
  return `room-${roomNumber.toLowerCase()}-token`;
}

function inventorySkuFromId(itemId: number) {
  return `INV-${String(itemId).padStart(3, "0")}`;
}

async function loadSeedData() {
  const raw = await readFile(join(seedDirectory, "seed-data.json"), "utf8");
  return JSON.parse(raw) as SeedData;
}

async function main() {
  const seedData = await loadSeedData();

  await prisma.$transaction(async (db) => {
    for (const roomNumber of seedData.rooms) {
      const room = await db.room.upsert({
        where: { number: roomNumber },
        update: {
          code: roomCodeFromNumber(roomNumber),
          accessToken: roomTokenFromNumber(roomNumber),
          isActive: true,
        },
        create: {
          number: roomNumber,
          code: roomCodeFromNumber(roomNumber),
          accessToken: roomTokenFromNumber(roomNumber),
        },
      });

      // No placeholder RoomDevice is seeded anymore — the first real browser
      // pairing via POST /guest/device-sessions creates the device record with
      // its actual fingerprint, keeping /rooms free of unused stub rows.
    }

    for (const item of seedData.inventory) {
      await db.inventoryItem.upsert({
        where: { sku: inventorySkuFromId(item.id) },
        update: {
          name: item.name,
          category: item.category,
          unit: item.unit,
          quantityInStock: item.quantity_in_stock,
          quantityReserved: 0,
          lowStockThreshold: item.low_stock_threshold,
          isActive: true,
        },
        create: {
          sku: inventorySkuFromId(item.id),
          name: item.name,
          category: item.category,
          unit: item.unit,
          quantityInStock: item.quantity_in_stock,
          quantityReserved: 0,
          lowStockThreshold: item.low_stock_threshold,
        },
      });
    }

    // Seed the initial staff user (staff@example.com / staff1234).
    // Manual insert using better-auth's scrypt hasher so the password
    // hash is verifiable at sign-in time.
    const staffEmail = "staff@example.com";
    const staffPassword = "staff1234";
    const hashedPassword = await hashPassword(staffPassword);

    const staffUser = await db.user.upsert({
      where: { email: staffEmail },
      update: { name: "Staff", role: "admin" },
      create: {
        id: generateId(),
        name: "Staff",
        email: staffEmail,
        emailVerified: true,
        role: "admin",
      },
    });

    const existingAccount = await db.account.findFirst({
      where: { userId: staffUser.id, providerId: "credential" },
      select: { id: true },
    });

    if (existingAccount) {
      await db.account.update({
        where: { id: existingAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      await db.account.create({
        data: {
          id: generateId(),
          accountId: staffUser.id,
          providerId: "credential",
          userId: staffUser.id,
          password: hashedPassword,
        },
      });
    }

    console.log(`Seeded staff user: ${staffEmail}`);
  });

  const [roomCount, inventoryCount, deviceCount] = await Promise.all([
    prisma.room.count(),
    prisma.inventoryItem.count(),
    prisma.roomDevice.count(),
  ]);

  console.log(
    `Seeded ${roomCount} rooms, ${deviceCount} room devices, and ${inventoryCount} inventory items.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
