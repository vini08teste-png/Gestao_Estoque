"use server";

import { redirect } from "next/navigation";
import { allowLogin, createSession, endSession, loadViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAddress, validEmail, type FormResult } from "@/lib/forms";
import { hashPassword, passwordLength, passwordLengthText, validPassword, verifyPassword } from "@/lib/password";

export async function login(_: FormResult, data: FormData): Promise<FormResult> {
  const email = emailAddress(data);
  const password = data.get("password");
  const error = { error: "Não foi possível entrar. Confira suas credenciais ou tente mais tarde." };
  if (!validEmail(email) || typeof password !== "string" || !password || password.length > passwordLength.max) return error;
  if (!(await allowLogin(email))) return error;
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, scopes: { where: { active: true }, select: { userId: true }, take: 1 } },
  });
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!valid || !user || !user.scopes.length) return error;
  if (!await createSession(user.id, user.passwordHash)) return error;
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(_: FormResult, data: FormData): Promise<FormResult> {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  const current = data.get("currentPassword");
  const password = data.get("password");
  if (typeof password !== "string" || !validPassword(password) || password !== data.get("confirmation")) {
    return { error: `Use uma senha com ${passwordLengthText} caracteres e repita o mesmo valor no campo de confirmação.` };
  }
  if (typeof current !== "string" || !current || current.length > passwordLength.max) return { error: "Informe a senha atual." };
  if (current === password) return { error: "Escolha uma senha diferente da atual." };
  const user = await db.user.findUnique({ where: { id: viewer.id }, select: { passwordHash: true } });
  if (!user || !await allowLogin(`password-change:${viewer.id}`) || !await verifyPassword(current, user.passwordHash)) {
    return { error: "Não foi possível confirmar a senha atual. Confira o valor ou tente mais tarde." };
  }
  const passwordHash = await hashPassword(password);
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.user.updateMany({ where: { id: viewer.id, passwordHash: user.passwordHash }, data: { passwordHash, mustChangePassword: false } });
    if (!result.count) return false;
    await tx.session.deleteMany({ where: { userId: viewer.id } });
    return true;
  });
  if (!updated) return { error: "A senha foi alterada em outra sessão. Entre novamente." };
  await endSession();
  redirect("/login?senha=alterada");
}
