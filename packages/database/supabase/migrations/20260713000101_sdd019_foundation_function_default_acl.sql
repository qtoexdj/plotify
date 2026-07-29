-- SDD019 forward-fix: PostgreSQL's built-in PUBLIC EXECUTE is a global
-- function default. A per-schema revoke cannot override a global grant.
alter default privileges for role postgres revoke execute on functions from public;

-- Runtime roles inherit PUBLIC, so the global revoke is sufficient. Explicit
-- EXECUTE grants in 00100 remain unchanged on the five service-only RPCs.
-- Rollback is forward-fix only: never restore broad future-function EXECUTE.
