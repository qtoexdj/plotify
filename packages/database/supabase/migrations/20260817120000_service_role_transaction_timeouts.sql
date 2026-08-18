-- Migration: 20260817120000_service_role_transaction_timeouts.sql
-- Hardening: Prevenir conexiones zombis y transacciones huerfanas en el rol service_role

ALTER ROLE service_role SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE service_role SET statement_timeout = '60s';
ALTER ROLE service_role SET lock_timeout = '10s';
