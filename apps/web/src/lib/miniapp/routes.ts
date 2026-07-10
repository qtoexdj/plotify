export function miniAppOrgId(searchParams: URLSearchParams): string | null {
  return searchParams.get('org') ?? searchParams.get('org_id')
}

export function miniAppUrl(
  path: string,
  orgId: string,
  params: Record<string, string> = {}
): string {
  const query = new URLSearchParams({ org: orgId, ...params })
  return `${path}?${query.toString()}`
}
