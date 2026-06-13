import prisma from "./config/prisma.js";

async function main() {
  const profiles = await prisma.userProfile.findMany({
    take: 5
  });
  profiles.forEach(p => console.log(p.userId, p.resume));
}

main().catch(console.error).finally(() => prisma.$disconnect());
