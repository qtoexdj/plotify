export function miniAppOrgId(searchParams: URLSearchParams): string | null {
  return searchParams.get('org') ?? searchParams.get('org_id')
}

export function resolveMiniAppOrgId(
  queryOrgId: string | null,
  startParam: string | null
): string | null {
  if (queryOrgId) return queryOrgId
  if (startParam && !startParam.startsWith('lot_')) return startParam
  return null
}

export function miniAppUrl(
  path: string,
  orgId: string,
  params: Record<string, string> = {}
): string {
  const query = new URLSearchParams({ org: orgId, ...params })
  return `${path}?${query.toString()}`
}
