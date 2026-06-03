select
  processing_status,
  count(*) as documents
from lab_escrituras.source_documents
group by processing_status
order by processing_status;

select
  d.id,
  d.original_filename,
  d.document_type,
  d.source_format,
  d.processing_status,
  d.detected_pdf_type,
  d.page_count,
  count(distinct p.id) as pages,
  count(distinct c.id) as chunks
from lab_escrituras.source_documents d
left join lab_escrituras.document_pages p on p.document_id = d.id
left join lab_escrituras.document_chunks c on c.document_id = d.id
group by d.id
order by d.created_at desc
limit 20;

select
  canonical_variable,
  future_source,
  source_table,
  source_field,
  confidence,
  left(evidence, 160) as evidence_preview
from lab_escrituras.extracted_variable_candidates
order by confidence desc, created_at desc
limit 30;
