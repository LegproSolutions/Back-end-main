import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching all companies...");
  const companies = await prisma.company.findMany();
  
  console.log(`Found ${companies.length} companies.`);

  for (const company of companies) {
    console.log(`\nProcessing Company: "${company.name}" (ID: ${company.id})`);
    
    // Find all clients that match this company by name, email, or companyId
    const matchingClients = await prisma.client.findMany({
      where: {
        OR: [
          { companyId: company.id },
          { company_name: { equals: company.name.trim(), mode: 'insensitive' } },
          { email: { equals: company.email.trim(), mode: 'insensitive' } }
        ],
        isDeleted: false
      }
    });

    console.log(`Found ${matchingClients.length} matching clients in CRM.`);

    if (matchingClients.length > 0) {
      // Keep the first client (preferring the one that has companyId set)
      const primaryClient = matchingClients.find(c => c.companyId === company.id) || matchingClients[0];
      
      // Update primary client to ensure companyId is set and name is trimmed
      await prisma.client.update({
        where: { id: primaryClient.id },
        data: {
          companyId: company.id,
          company_name: company.name.trim(),
          email: company.email.trim(),
          phone: company.phone.trim()
        }
      });
      console.log(`Set Client "${primaryClient.company_name}" (ID: ${primaryClient.id}) companyId to ${company.id}`);

      // If there are other matching clients, they are duplicates. Mark them as deleted or remove them.
      for (const duplicate of matchingClients) {
        if (duplicate.id !== primaryClient.id) {
          // Re-route any candidates, pipelines, or jobs from duplicate client to primary client
          await prisma.cRMCandidate.updateMany({
            where: { client_id: duplicate.id },
            data: { client_id: primaryClient.id }
          });
          
          await prisma.candidatePipeline.updateMany({
            where: { client_id: duplicate.id },
            data: { client_id: primaryClient.id }
          });

          await prisma.cRMJob.updateMany({
            where: { client_id: duplicate.id },
            data: { client_id: primaryClient.id }
          });

          // Soft delete or hard delete the duplicate
          await prisma.client.update({
            where: { id: duplicate.id },
            data: { isDeleted: true, deletedAt: new Date() }
          });
          console.log(`Soft deleted duplicate client ID: ${duplicate.id}`);
        }
      }
    }
  }

  console.log("\nCleanup finished successfully!");
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
