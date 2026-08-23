import { db } from '@/lib/db'

/** Services and staff as the public pages need them. Queries only, no decisions. */

export async function getBusiness() {
  const business = await db.business.findFirst()
  if (!business) throw new Error('No business configured. Run `npm run db:seed`.')
  return business
}

export type PublicService = {
  id: string
  slug: string
  name: string
  description: string | null
  durationMins: number
  priceMinor: number
  requiresApproval: boolean
}

export async function listServices(businessId: string): Promise<PublicService[]> {
  return db.service.findMany({
    where: { businessId, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      durationMins: true,
      priceMinor: true,
      requiresApproval: true,
    },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function getServiceBySlug(businessId: string, slug: string) {
  return db.service.findFirst({
    where: { businessId, slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      durationMins: true,
      priceMinor: true,
      requiresApproval: true,
    },
  })
}

export type PublicStaff = {
  id: string
  slug: string
  name: string
  bio: string | null
}

/** Staff who can perform a given service — the choices offered at step 2. */
export async function listStaffForService(
  businessId: string,
  serviceId: string,
): Promise<PublicStaff[]> {
  return db.staff.findMany({
    where: { businessId, isActive: true, services: { some: { serviceId } } },
    select: { id: true, slug: true, name: true, bio: true },
    orderBy: { sortOrder: 'asc' },
  })
}

/** Everyone, for the team page. */
export async function listStaff(businessId: string) {
  return db.staff.findMany({
    where: { businessId, isActive: true },
    relationLoadStrategy: 'join',
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      services: { select: { service: { select: { name: true, slug: true } } } },
    },
    orderBy: { sortOrder: 'asc' },
  })
}
