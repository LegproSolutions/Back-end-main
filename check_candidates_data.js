import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.cRMCandidate.findMany({
    take: 5,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true
    }
  });
  console.log(JSON.stringify(candidates, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
