import { PrismaClient } from "@prisma/client";

const passwords = [
  "",
  "postgres",
  "postgres123",
  "postgres1234",
  "postgres12",
  "postgres@123",
  "Postgres@123",
  "Postgres123",
  "Postgres",
  "admin",
  "admin123",
  "Admin123",
  "Admin@123",
  "root",
  "root123",
  "password",
  "Pass1125@",
  "Pass1125",
  "NAVGAP2025BJ",
  "navgap2025bj",
  "job_mela",
  "jobmela",
  "jobmela123",
  "Jobmela123",
  "JobMela123",
  "JobMela",
  "JobMela123!",
  "JobMela@123",
  "123456",
  "12345678",
  "123456789",
  "1234",
  "123"
];

async function testPassword(password) {
  const dbUrl = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:5432/job_mela?schema=public`;
  process.env.DATABASE_URL = dbUrl;
  
  const client = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });

  try {
    await client.$connect();
    console.log(`\n🎉 SUCCESS! Password is: ${password}`);
    await client.$disconnect();
    return true;
  } catch (error) {
    process.stdout.write(`.`);
    await client.$disconnect();
    return false;
  }
}

async function main() {
  console.log("Testing passwords...");
  for (const pw of passwords) {
    const success = await testPassword(pw);
    if (success) {
      process.exit(0);
    }
  }
  console.log("\n❌ All password attempts failed.");
  process.exit(1);
}

main();
