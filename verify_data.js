import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres123@127.0.0.1:5432/job_mela?schema=public"
    },
  },
});

async function main() {
  const job = await prisma.job.findFirst();
  console.log("Sample Job:", JSON.stringify(job, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
