-- Data fix: dedupe notification_events keeping earliest record (preserves read_at and dismissed_at metadata)
DELETE FROM public.notification_events
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY approval_id, recipient_id, recipient_role
      ORDER BY created_at ASC, id ASC
    ) AS rn
    FROM public.notification_events
  ) d
  WHERE d.rn > 1
);;
