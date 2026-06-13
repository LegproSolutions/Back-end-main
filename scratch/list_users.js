import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash("Pass1125@", salt);

  // Update manager
  const manager = await prisma.companyStaff.updateMany({
    where: { email: "avneesh@legpro.co.in" },
    data: { password: hashedPassword }
  });
  console.log("Updated manager password count:", manager.count);

  // Update recruiter
  const recruiter = await prisma.companyStaff.updateMany({
    where: { email: "Agent@legpro.co.in" },
    data: { password: hashedPassword }
  });
  console.log("Updated recruiter password count:", recruiter.count);

  // Update admin password just in case
  const admin = await prisma.admin.updateMany({
    where: { email: "AdminAbhisek@JobMela.com" },
    data: { password: hashedPassword }
  });
  console.log("Updated admin password count:", admin.count);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
