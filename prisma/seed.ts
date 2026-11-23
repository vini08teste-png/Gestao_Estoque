import "dotenv/config";
import { db } from "../lib/db";
import { validEmail } from "../lib/forms";
import { hashPassword, validPassword } from "../lib/password";
import { companyBrands } from "../lib/organization";

async function seed() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const name = process.env.INITIAL_ADMIN_NAME?.trim() ?? "";
  const password = process.env.INITIAL_ADMIN_PASSWORD ?? "";
  if (!validEmail(email) || !name || name.length > 120 || !validPassword(password)) {
    throw new Error("Configure INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME e INITIAL_ADMIN_PASSWORD (12 a 128 caracteres).");
  }
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({ where: { email }, create: { email, passwordHash }, update: {} });
    for (const [id, brand] of Object.entries(companyBrands)) {
      await tx.company.upsert({ where: { id }, create: { id, name: brand.label }, update: {} });
      const companyId_userId = { companyId: id, userId: user.id };
      await tx.userScope.upsert({
        where: { companyId_userId },
        create: { ...companyId_userId, name, role: "ADMIN", allUnits: true },
        update: {},
      });
    }
  });
  console.log("Empresas e acessos iniciais configurados.");
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha ao criar os cadastros iniciais.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
