import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/**
 * Deletes RoomDevice rows that were created by the old seed as placeholders
 * (fingerprint `tablet-<roomNumber>`) and have never had a session. Safe to
 * run more than once — it only removes rows with `sessions: none`.
 */
async function main() {
  try {
    const { count } = await prisma.roomDevice.deleteMany({
      where: {
        deviceFingerprint: { startsWith: "tablet-" },
        sessions: { none: {} },
      },
    });

    console.log(`Removed ${count} unused placeholder RoomDevice row(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
