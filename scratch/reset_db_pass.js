import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres:@127.0.0.1:5432/job_mela?schema=public"
      }
    }
  });

  try {
    console.log("Connecting to database...");
    await prisma.$connect();
    console.log("Connected. Altering user password...");
    await prisma.$executeRawUnsafe("ALTER USER postgres WITH PASSWORD 'postgres123';");
    console.log("✅ Password successfully reset to 'postgres123'!");
  } catch (error) {
    console.error("❌ Failed to alter password:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
