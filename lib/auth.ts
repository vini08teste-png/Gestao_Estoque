import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { isCompany } from "./organization";

const ttl = 12 * 60 * 60 * 1000;
const secure = process.env.NODE_ENV === "production" && process.env.LOCAL_HTTP !== "true";
const cookieName = secure ? "__Host-epi-session" : "epi-session";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function sessionToken() {
  const token = (await cookies()).get(cookieName)?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? digest(token) : null;
}

export const loadViewer = cache(async () => {
  const tokenHash = await sessionToken();
  if (!tokenHash) return null;
  const session = await db.session.findUnique({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    select: {
      user: {
        select: {
          id: true,
          mustChangePassword: true,
          scopes: {
            where: { active: true },
            orderBy: { companyId: "desc" },
            include: {
              company: true,
              units: { select: { unitId: true } },
              employee: { select: { id: true, unitId: true, active: true } },
            },
          },
        },
      },
    },
  });
  if (!session) return null;
  const scopes = session.user.scopes.filter((scope) => isCompany(scope.companyId) &&
    (!["SUPERVISOR", "EMPLOYEE"].includes(scope.role) || scope.employee?.active));
  return { id: session.user.id, scopes, mustChangePassword: session.user.mustChangePassword };
});

export async function requireViewer() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (viewer.mustChangePassword) redirect("/conta/senha");
  return viewer;
}

export async function requireScope(companyId: string) {
  const viewer = await requireViewer();
  const scope = viewer.scopes.find((entry) => entry.companyId === companyId);
  if (!scope) notFound();
  return { viewer, scope };
}

export type AccessScope = Awaited<ReturnType<typeof requireScope>>["scope"];
export const canAdminister = (scope: AccessScope) => scope.role === "ADMIN" && scope.allUnits;

export async function createSession(userId: string, expectedHash: string) {
  const jar = await cookies();
  const priorToken = await sessionToken();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttl);
  const created = await db.$transaction(async (tx) => {
    const matched = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE id = ${userId} AND "passwordHash" = ${expectedHash} FOR UPDATE
    `;
    if (!matched.length) return false;
    await tx.session.deleteMany({
      where: { OR: [{ expiresAt: { lte: new Date() } }, ...(priorToken ? [{ tokenHash: priorToken }] : [])] },
    });
    await tx.loginAttempt.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    await tx.session.create({ data: { tokenHash: digest(token), userId, expiresAt } });
    return true;
  });
  if (!created) return false;
  jar.set(cookieName, token, { httpOnly: true, secure, sameSite: "lax", path: "/", expires: expiresAt });
  return true;
}

export async function endSession() {
  const tokenHash = await sessionToken();
  if (tokenHash) await db.session.deleteMany({ where: { tokenHash } });
  (await cookies()).set(cookieName, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function allowLogin(email: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const key = digest(email);
  const [result] = await db.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginAttempt" ("key", "startedAt", "attempts") VALUES (${key}, ${now}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginAttempt"."startedAt" <= ${cutoff} THEN 1
                        ELSE LEAST("LoginAttempt"."attempts" + 1, 11) END,
      "startedAt" = CASE WHEN "LoginAttempt"."startedAt" <= ${cutoff} THEN ${now}
                         ELSE "LoginAttempt"."startedAt" END
    RETURNING "attempts"
  `;
  return result.attempts <= 10;
}
