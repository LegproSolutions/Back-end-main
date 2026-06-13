import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.userProfile.count();
  const crmCandidateCount = await prisma.cRMCandidate.count({ 
    where: { 
      isDeleted: false,
      source: { not: "JobMela Portal" }
    } 
  });
  const companies = await prisma.company.count();
  const jobs = await prisma.job.count({ where: { visible: true } });
  
  console.log("Prisma Counts:", {
    userCount,
    crmCandidateCount,
    companies,
    jobs,
    totalJobseekers: userCount + crmCandidateCount
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
