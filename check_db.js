import prisma from "./config/prisma.js";

async function main() {
  const apps = await prisma.jobApplication.findMany({
    orderBy: { date: 'desc' },
    take: 5
  });
  apps.forEach(app => console.log(app.id, app.applicationData.resume));
}

main().catch(console.error).finally(() => prisma.$disconnect());
