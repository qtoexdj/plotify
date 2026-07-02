# Checklist: Servidumbre Test Alignment Requirements

**Purpose**: Validate that SDD 014 requirements define enough test coverage before implementation
**Created**: 2026-07-02
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 Are requirements defined for centerline roads with explicit total width? [Completeness, Spec FR-001/FR-003]
- [x] CHK002 Are requirements defined for polygon road footprints that must not be buffered again? [Completeness, Spec FR-003]
- [x] CHK003 Are requirements defined for ambiguous line or border roads before calculation? [Completeness, Spec FR-016]
- [x] CHK004 Are requirements defined for per-road widths instead of a single project width? [Completeness, Spec FR-002]
- [x] CHK005 Are requirements defined for lots affected by more than one width? [Completeness, Spec FR-007]
- [x] CHK006 Are requirements defined for preserving legacy projects with global road width? [Completeness, Spec FR-008]

## Requirement Clarity

- [x] CHK007 Is the servidumbre formula stated as intersection of lot and road footprint? [Clarity, Spec Context]
- [x] CHK008 Is double counting explicitly forbidden when footprints overlap? [Clarity, Spec FR-005]
- [x] CHK009 Is the area identity `util + servidumbre = total` quantified? [Clarity, Spec SC-001]
- [x] CHK010 Is the display format for multiple widths specified? [Clarity, Spec US2/SC-003]

## Requirement Consistency

- [x] CHK011 Do viewer requirements and document requirements refer to the same persisted values? [Consistency, Spec FR-010/FR-014]
- [x] CHK012 Do override requirements avoid silently replacing official legal values? [Consistency, Spec FR-013]
- [x] CHK013 Do recalculation requirements cover both road changes and later lot assignment? [Consistency, Spec FR-011/FR-012]

## Scenario Coverage

- [x] CHK014 Are zero-servitude lots included in acceptance and success criteria? [Coverage, Spec US2/SC-005]
- [x] CHK015 Are MultiPolygon and holes included as edge cases and test requirements? [Coverage, Spec Edge Cases/FR-015]
- [x] CHK016 Are Teno-like 5 m, 10 m and 5 y 10 cases included? [Coverage, Spec SC-007]
- [x] CHK017 Are rendering requirements defined for a servidumbre overlay, not only numbers? [Coverage, Spec US3/FR-009]

## Acceptance Criteria Quality

- [x] CHK018 Can each user story be tested independently? [Acceptance Criteria]
- [x] CHK019 Are success criteria measurable without reading implementation code? [Measurability]
- [x] CHK020 Is the test gate explicit enough to block implementation closure when coverage is missing? [Acceptance Criteria, Spec SC-008]
