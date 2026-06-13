import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding CRM data...');

  // Create a Client
  const client = await prisma.client.create({
    data: {
      company_name: 'Antigravity Tech',
      industry: 'AI & Robotics',
      contact_person: 'Antigravity AI',
      email: 'ai@antigravity.com',
      phone: '1234567890',
      location: 'Silicon Valley',
    },
  });

  console.log('Created client:', client.company_name);

  // Create a few candidates
  const candidates = await Promise.all([
    prisma.cRMCandidate.create({
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '9998887776',
        education: 'B.Tech',
        trades: 'Fullstack Developer',
        state: 'California',
        district: 'San Francisco',
        source: 'LinkedIn',
        gender: 'Male',
        dob: '01-01-1995',
        experience: '3 years',
      },
    }),
    prisma.cRMCandidate.create({
      data: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '9998887775',
        education: 'M.Tech',
        trades: 'AI Engineer',
        state: 'New York',
        district: 'Manhattan',
        source: 'Referral',
        gender: 'Female',
        dob: '15-05-1992',
        experience: '5 years',
      },
    }),
  ]);

  console.log('Created candidates:', candidates.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
