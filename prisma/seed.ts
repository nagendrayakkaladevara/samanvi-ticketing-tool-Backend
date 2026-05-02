import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RoleCode } from "@prisma/client";
import { Pool } from "pg";
import { hashPassword } from "../src/auth/password";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL is required for seeding");
}

const adapter = new PrismaPg(
  new Pool({
    connectionString,
  }),
);

const prisma = new PrismaClient({ adapter });

async function main() {
  const roles: Array<{ code: RoleCode; label: string }> = [
    { code: RoleCode.admin, label: "Admin" },
    { code: RoleCode.supervisor, label: "Supervisor" },
    { code: RoleCode.worker, label: "Worker" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { label: role.label },
      create: {
        code: role.code,
        label: role.label,
      },
    });
  }

  const roleRows = await prisma.role.findMany({
    where: {
      code: {
        in: [RoleCode.admin, RoleCode.supervisor, RoleCode.worker],
      },
    },
    select: { id: true, code: true },
  });
  const roleIdByCode = new Map(roleRows.map((row) => [row.code, row.id]));

  const defaultUsers = [
    {
      username: "admin",
      password: "admin123",
      displayName: "Admin User",
      roleCode: RoleCode.admin,
    },
    {
      username: "supervisor",
      password: "supervisor123",
      displayName: "Supervisor User",
      roleCode: RoleCode.supervisor,
    },
    {
      username: "worker",
      password: "worker123",
      displayName: "Worker User",
      roleCode: RoleCode.worker,
    },
  ] as const;

  for (const user of defaultUsers) {
    const roleId = roleIdByCode.get(user.roleCode);
    if (!roleId) {
      throw new Error(`Missing role id for code ${user.roleCode}`);
    }

    const passwordHash = await hashPassword(user.password);

    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        displayName: user.displayName,
        roleId,
        isActive: true,
        passwordHash,
      },
      create: {
        username: user.username,
        passwordHash,
        displayName: user.displayName,
        roleId,
      },
    });
  }

  const defaultCategories = [
    "Engine",
    "Electrical",
    "Body Damage",
    "Tires",
    "Interior",
    "Other",
  ] as const;

  for (const categoryName of defaultCategories) {
    await prisma.issueCategory.upsert({
      where: { name: categoryName },
      update: { isActive: true },
      create: {
        name: categoryName,
      },
    });
  }

  console.log("Seeded default roles:", roles.map((role) => role.code).join(", "));
  console.log("Seeded default users:", defaultUsers.map((user) => user.username).join(", "));
  console.log("Seeded default issue categories:", defaultCategories.join(", "));
}

main()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

