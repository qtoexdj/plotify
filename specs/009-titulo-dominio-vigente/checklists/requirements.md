# Requirements Checklist: SDD 009 Titulo Dominio Vigente

Trace FRs to phases/tasks. Update when tasks close.

| FR     | Description (short)                        | Phase | Key tasks       |
| ------ | ------------------------------------------ | ----- | --------------- |
| FR-001 | Project-scoped title analysis              | 3     | T016-T019       |
| FR-002 | Structure classification                   | 3     | T017            |
| FR-003 | Structured chain with evidence             | 3     | T017, T027      |
| FR-004 | Owners + comparecencia data                | 3     | T017, T027      |
| FR-005 | Deterministic evidence verifier            | 4     | T024            |
| FR-006 | Narrative from verified data only          | 4     | T026            |
| FR-007 | Versioned title_analyses persistence       | 2-3   | T002, T018      |
| FR-008 | Staging via variable_resolutions           | 4     | T027            |
| FR-009 | Replace regex extractor + catalog redesign | 1,3   | T004, T020-T021 |
| FR-010 | Rol cross-check vs SII                     | 4     | T025            |
| FR-011 | Typed alerts with evidence                 | 6     | T037            |
| FR-012 | Title review panel                         | 5     | T033-T035       |
| FR-013 | Approval gate with blockers                | 5     | T031            |
| FR-014 | Supersede + requeue on replacement         | 3     | T019            |
| FR-015 | Snapshot integration                       | 7     | T042            |
| FR-016 | llm_disabled manual degradation            | 3,5   | T018, T035      |
| FR-017 | Bounded, idempotent, observable runs       | 3     | T018            |
| FR-018 | Tenant isolation                           | 2,8   | T002, T046      |
| FR-019 | Proposal-only LLM                          | 4     | T024, T027      |
| FR-020 | Re-renderable blocks with history          | 4-5   | T026, T031      |

Success criteria gates:

- [ ] SC-001 chain accuracy on Teno corpus (live eval + golden tests)
- [ ] SC-002 hallucination regression suite green
- [ ] SC-003 alert coverage on Teno corpus
- [ ] SC-004 SII cross-check determinism
- [ ] SC-005 review-in-10-minutes / 2-click evidence
- [ ] SC-006 supersede re-blocks gate
- [ ] SC-007 llm_disabled manual path
- [ ] SC-008 snapshot consumable by SDD 008
- [ ] SC-009 idempotency per source hash
- [ ] SC-010 run observability (model, tokens, duration, failures)
