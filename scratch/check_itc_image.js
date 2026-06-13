import prisma from "../config/prisma.js";

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "ITC", mode: "insensitive" } }
  });
  console.log("Company info:", company);
}

main().catch(console.error);
