import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const unknownCandidates = await prisma.cRMCandidate.findMany({
    where: { name: 'Unknown' }
  });

  console.log(`Found ${unknownCandidates.length} unknown candidates.`);

  for (const candidate of unknownCandidates) {
    if (candidate.email || candidate.phone) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: candidate.email || '___non_existent___' },
            { phone: candidate.phone || '___non_existent___' }
          ]
        }
      });

      if (user && user.name && user.name !== 'Unknown') {
        console.log(`Matching user found for ${candidate.email || candidate.phone}: ${user.name}`);
        // await prisma.cRMCandidate.update({
        //   where: { id: candidate.id },
        //   data: { name: user.name }
        // });
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
