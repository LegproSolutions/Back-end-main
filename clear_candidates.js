import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Deleting all candidate-related data...');
  
  try {
    // Delete in order to satisfy foreign key constraints
    const d1 = await prisma.candidatePipeline.deleteMany({});
    console.log(`Deleted ${d1.count} pipeline entries.`);
    
    const d2 = await prisma.call.deleteMany({});
    console.log(`Deleted ${d2.count} call logs.`);
    
    const d3 = await prisma.aIScreening.deleteMany({});
    console.log(`Deleted ${d3.count} AI screening records.`);
    
    const d4 = await prisma.cRMCandidate.deleteMany({});
    console.log(`Deleted ${d4.count} candidates.`);
    
    console.log('All candidate data cleared successfully.');
  } catch (error) {
    console.error('Error clearing candidate data:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
