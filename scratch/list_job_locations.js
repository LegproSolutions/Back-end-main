import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      title: true,
      location: true,
      companyDetails: true
    }
  });
  console.log("Jobs in database:", jobs);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
