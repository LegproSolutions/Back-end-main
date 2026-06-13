import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { level: { equals: 'Beginner Level', mode: 'insensitive' } },
          { level: { equals: 'Beginner level', mode: 'insensitive' } },
          { level: { equals: 'Beginner', mode: 'insensitive' } }
        ]
      }
    });
    
    console.log(`Found ${jobs.length} jobs with Beginner level.`);
    
    const result = await prisma.job.updateMany({
      where: {
        OR: [
          { level: { equals: 'Beginner Level', mode: 'insensitive' } },
          { level: { equals: 'Beginner level', mode: 'insensitive' } },
          { level: { equals: 'Beginner', mode: 'insensitive' } }
        ]
      },
      data: {
        level: "Entry Level"
      }
    });
    console.log(`Updated ${result.count} jobs to 'Entry Level'.`);
  } catch (error) {
    console.error("Error updating jobs:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
