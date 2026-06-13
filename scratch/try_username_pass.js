import { PrismaClient } from "@prisma/client";

const usernames = ["postgres", "RITS", "rits"];
const passwords = [
  "postgres123",
  "postgres",
  "admin",
  "root",
  "Pass1125@",
  "JobMela@123",
  "jobmela",
  "admin123",
  "123456",
  ""
];

async function testConnection(username, password) {
  const dbUrl = `postgresql://${username}:${encodeURIComponent(password)}@127.0.0.1:5432/job_mela?schema=public`;
  
  const client = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });

  try {
    await client.$connect();
    console.log(`\n🎉 SUCCESS! Username: ${username}, Password: ${password}`);
    console.log(`URL: ${dbUrl}`);
    await client.$disconnect();
    return true;
  } catch (error) {
    process.stdout.write(`.`);
    await client.$disconnect();
    return false;
  }
}

async function main() {
  console.log("Testing user/pass combinations...");
  for (const user of usernames) {
    for (const pw of passwords) {
      const success = await testConnection(user, pw);
      if (success) {
        process.exit(0);
      }
    }
  }
  console.log("\n❌ All connection attempts failed.");
  process.exit(1);
}

main();
