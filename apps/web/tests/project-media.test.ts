import { describe, expect, it } from 'vitest'

import { groupProjectImageIds } from '@/lib/projects/project-media'

describe('groupProjectImageIds', () => {
  it('projects ready image metadata as ordered opaque IDs only', () => {
    const grouped = groupProjectImageIds([
      {
        id: '8fd741a8-3f28-42e0-927d-fd68116a7ec1',
        project_id: 'project-1',
        created_at: '2026-07-28T12:00:00.000Z',
      },
      {
        id: 'e2459a5d-adce-42ea-bbca-f0fbf20a64be',
        project_id: 'project-1',
        created_at: '2026-07-28T13:00:00.000Z',
      },
      {
        id: 'ca125b92-7c17-495f-89bb-df30a53bd737',
        project_id: 'project-2',
        created_at: '2026-07-28T14:00:00.000Z',
      },
    ])

    expect(grouped.get('project-1')).toEqual([
      '8fd741a8-3f28-42e0-927d-fd68116a7ec1',
      'e2459a5d-adce-42ea-bbca-f0fbf20a64be',
    ])
    expect(grouped.get('project-2')).toEqual(['ca125b92-7c17-495f-89bb-df30a53bd737'])
  })
})
