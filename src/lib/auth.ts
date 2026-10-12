import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const SESSION_COOKIE = "fassa_session";

const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? "24");

export type StaffIdentity = {
  kind: "STAFF";
  sessionId: string;
  userId: string;
  loginId: string;
  name: string;
  role: "ADMIN" | "GAME_MASTER";
};

export type SchoolIdentity = {
  kind: "SCHOOL";
  sessionId: string;
  participantId: string;
  schoolId: string;
  schoolName: string;
  displayName: string;
};

export type Identity = StaffIdentity | SchoolIdentity;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function createStaffSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);
  await prisma.session.create({
    data: { token, kind: "STAFF", userId, expiresAt },
  });
  await setSessionCookie(token, expiresAt);
}

export async function createSchoolSession(participantId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);
  await prisma.session.create({
    data: { token, kind: "SCHOOL", participantId, expiresAt },
  });
  await setSessionCookie(token, expiresAt);
}

export async function getIdentity(): Promise<Identity | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: true,
      participant: { include: { school: true } },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (session.kind === "STAFF") {
    if (!session.user || !session.user.active) return null;
    return {
      kind: "STAFF",
      sessionId: session.id,
      userId: session.user.id,
      loginId: session.user.loginId,
      name: session.user.name,
      role: session.user.role,
    };
  }

  if (!session.participant) return null;
  return {
    kind: "SCHOOL",
    sessionId: session.id,
    participantId: session.participant.id,
    schoolId: session.participant.schoolId,
    schoolName: session.participant.school.name,
    displayName: session.participant.displayName,
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}
