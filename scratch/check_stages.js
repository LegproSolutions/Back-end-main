import prisma from "../config/prisma.js";

async function main() {
  const stages = await prisma.pipelineStage.findMany();
  console.log("All Pipeline Stages in DB:", stages);
}

main().catch(console.error).finally(() => prisma.$disconnect());
