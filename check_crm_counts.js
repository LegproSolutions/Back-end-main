import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findFirst({
    where: { company_name: "CNH" }
  });

  if (!client) {
    console.log("CNH Client not found");
    return;
  }

  console.log("Client ID:", client.id);

  // 1. CandidatePipeline count
  const pipelines = await prisma.candidatePipeline.findMany({
    where: { client_id: client.id },
    include: { candidate: true }
  });
  console.log(`CandidatePipeline Count: ${pipelines.length}`);
  pipelines.forEach(p => {
    console.log(`- Candidate: ${p.candidate.name}, Phone: ${p.candidate.phone}, isDeleted: ${p.candidate.isDeleted}, Stage: ${p.stage_id}`);
  });

  // 2. CRMCandidate count
  const crmCandidates = await prisma.cRMCandidate.findMany({
    where: { client_id: client.id }
  });
  console.log(`CRMCandidate Count: ${crmCandidates.length}`);

  // 3. Jobs for this client
  const crmJobs = await prisma.cRMJob.findMany({
    where: { client_id: client.id }
  });
  console.log(`CRMJobs Count: ${crmJobs.length}`);

  // 4. Portal jobs for company
  const portalJobs = await prisma.job.findMany({
    where: { companyId: client.companyId },
    include: {
      _count: {
        select: { applications: true }
      }
    }
  });
  console.log(`Portal Jobs Count: ${portalJobs.length}`);
  portalJobs.forEach(j => {
    console.log(`- Job: ${j.title}, Applications Count: ${j._count.applications}`);
  });

  // 5. Total portal applications for company
  const totalPortalApps = await prisma.jobApplication.count({
    where: { companyId: client.companyId }
  });
  console.log(`Total Portal Applications: ${totalPortalApps}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
