import { prisma } from "../lib/prisma.js";

export async function audit(actorId: string | null, action: string, entityType: string, entityId?: string | null, details?: unknown) {
  await prisma.adminAuditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details === undefined ? undefined : JSON.parse(JSON.stringify(details)),
    },
  });
}

export async function listAudit(page: number, pageSize: number) {
  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count(),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, username: true, role: true } } },
    }),
  ]);
  return {
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
