import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.job.updateMany({
      where: {
        isVerified: true,
        status: "Pending Admin Verification" // Only update those that have the default but are already verified
      },
      data: {
        status: "Approved"
      }
    });
    console.log(`Updated ${result.count} existing jobs to 'Approved' status.`);
  } catch (error) {
    console.error("Error updating existing jobs:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
