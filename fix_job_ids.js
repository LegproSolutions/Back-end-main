import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    orderBy: { date: 'asc' }
  });

  console.log(`Found ${jobs.length} jobs.`);

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`Job ID: ${job.id}, current jobId: ${job.jobId}`);
    
    // If jobId is missing or 0, we'll assign one
    if (!job.jobId || job.jobId === 0) {
        const newJobId = i + 1; // Start from 1
        console.log(`Updating job ${job.id} with jobId ${newJobId}`);
        await prisma.job.update({
            where: { id: job.id },
            data: { jobId: newJobId }
        });
    }
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
