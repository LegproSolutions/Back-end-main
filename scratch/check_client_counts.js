import prisma from "../config/prisma.js";

async function main() {
  const clientId = "32cacf44-2142-4a90-986f-2a19e6d7d347";
  
  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });
  console.log("Client Name:", client ? client.company_name : "Not Found");

  const pipeline = await prisma.candidatePipeline.findMany({
    where: { client_id: clientId },
    include: {
      stage: true,
      candidate: true
    }
  });

  console.log("Pipeline count:", pipeline.length);
  
  const stagesCount = {};
  pipeline.forEach(p => {
    const stageName = p.stage?.stage_name;
    stagesCount[stageName] = (stagesCount[stageName] || 0) + 1;
  });
  console.log("Pipeline Stages Breakdown:", stagesCount);

  const jobs = await prisma.cRMJob.findMany({
    where: { client_id: clientId }
  });
  console.log("CRM Jobs count:", jobs.length);
  console.log("Open CRM Jobs count:", jobs.filter(j => j.status === 'open').length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
