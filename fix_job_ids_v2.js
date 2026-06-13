import { PrismaClient } from '@prisma/client';

// Hardcoded for one-time fix to ensure connection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres123@127.0.0.1:5432/job_mela?schema=public"
    },
  },
});

async function main() {
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { date: 'asc' }
    });

    console.log(`Found ${jobs.length} jobs.`);

    // First pass: set to high temporary values to avoid collisions
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const tempJobId = 10000 + i + 1;
      await prisma.job.update({
          where: { id: job.id },
          data: { jobId: tempJobId }
      });
    }

    // Second pass: set to final sequential values
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const newJobId = i + 1; // Start from 1
      console.log(`Job ID: ${job.id}, current jobId: ${job.jobId} -> updating to: ${newJobId}`);
      
      await prisma.job.update({
          where: { id: job.id },
          data: { jobId: newJobId }
      });
    }
    console.log("Successfully updated all job IDs.");
  } catch (error) {
    console.error("Error during update:", error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
