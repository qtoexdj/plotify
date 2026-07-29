export const sdd019Viewports = {
  mobileSmall: { width: 320, height: 568 },
  mobile: { width: 375, height: 667 },
  tablet: { width: 769, height: 880 },
  desktop: { width: 1440, height: 900 },
} as const

export const sdd019Roles = [
  'admin_a',
  'seller_assigned',
  'seller_unassigned',
  'orgB',
  'superadmin',
] as const

export type Sdd019Role = (typeof sdd019Roles)[number]
