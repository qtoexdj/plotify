type ProjectImageRow = {
  id: string
  project_id: string
  created_at: string
}

export function groupProjectImageIds(rows: ProjectImageRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const row of rows) {
    const projectImages = grouped.get(row.project_id) ?? []
    projectImages.push(row.id)
    grouped.set(row.project_id, projectImages)
  }
  return grouped
}

export function projectFileHref(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}`
}
