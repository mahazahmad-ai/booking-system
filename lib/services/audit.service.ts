import { db } from '@/lib/db'

/**
 * FR-S4 — every admin mutation is audit-logged with actor, action and timestamp.
 *
 * Deliberately a human-readable summary rather than a before/after JSON diff: diffs rot
 * as the schema changes, and nobody builds the viewer. `actorEmail` is denormalised so
 * the trail survives the user row being deleted.
 *
 * Never throws. A failed audit write must not roll back the change it was describing.
 */
export async function audit(args: {
  businessId: string
  actorUserId: string | null
  actorEmail: string
  action: string
  entityType: string
  entityId: string
  summary: string
  ip?: string | null
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        businessId: args.businessId,
        actorUserId: args.actorUserId,
        actorEmail: args.actorEmail,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        summary: args.summary,
        ip: args.ip ?? null,
      },
    })
  } catch (e) {
    console.error('audit write failed', { action: args.action, error: String(e) })
  }
}

export async function listAuditLog(businessId: string, limit = 50) {
  return db.auditLog.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
