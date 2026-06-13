import prisma from "../config/prisma.js";

async function main() {
  const apps = await prisma.jobApplication.findMany({
    select: {
      id: true,
      userId: true,
      applicationData: true
    }
  });
  console.log("Total applications:", apps.length);
  for (const app of apps) {
    const data = app.applicationData || {};
    console.log(`App ID: ${app.id}`);
    console.log("email:", data.email);
    console.log("phone:", data.phone);
    console.log("gender:", data.gender);
    console.log("currentAddress:", data.currentAddress);
    console.log("education:", data.education ? Object.keys(data.education) : null);
    console.log("-------------------");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
