#!/usr/bin/env python3
import json
import os
import ipaddress
import argparse
from pathlib import Path
from urllib.parse import urlparse

import psycopg
from dotenv import dotenv_values
from psycopg.rows import dict_row


parser = argparse.ArgumentParser()
parser.add_argument("--target", choices=("linked",), required=True)
arguments = parser.parse_args()

workspace = Path(__file__).resolve().parents[3]
environment = dotenv_values(workspace / "apps" / "api" / ".env")
database_url = os.environ.get("SUPABASE_DB_URL") or environment.get("SUPABASE_DB_URL")
if not database_url:
    raise SystemExit("SUPABASE_DB_URL is required for catalog inventory")

host = (urlparse(database_url).hostname or "").lower()
known_local_hosts = {
    "localhost",
    "127.0.0.1",
    "::1",
    "host.docker.internal",
    "supabase-db",
    "supabase-pooler",
}
try:
    local_ip = ipaddress.ip_address(host).is_private or ipaddress.ip_address(host).is_loopback
except ValueError:
    local_ip = False
is_local = host in known_local_hosts or local_ip or "." not in host or host.endswith(".local")
project_ref_path = workspace / "packages" / "database" / "supabase" / ".temp" / "project-ref"
linked_project_path = workspace / "packages" / "database" / "supabase" / ".temp" / "linked-project.json"
if not project_ref_path.exists() or not linked_project_path.exists():
    raise SystemExit("linked catalog inventory requires Supabase link markers")
project_ref = project_ref_path.read_text().strip()
linked_project = json.loads(linked_project_path.read_text())
if linked_project.get("ref") != project_ref or project_ref not in database_url:
    raise SystemExit("SUPABASE_DB_URL does not match the linked project ref")
if is_local:
    raise SystemExit("cloud-only catalog inventory refuses a non-cloud database URL")

with psycopg.connect(database_url, row_factory=dict_row, connect_timeout=10, autocommit=True) as connection:
    with connection.cursor() as cursor:
        cursor.execute("begin read only")
        cursor.execute(
            """
            select
              n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
              p.prosecdef as security_definer,
              pg_get_functiondef(p.oid) as definition,
              owner.rolname as owner,
              coalesce(p.proconfig, array[]::text[]) as config,
              coalesce(
                array_agg(
                  distinct coalesce(grantee.rolname, 'PUBLIC') || ':' || x.privilege_type
                  order by coalesce(grantee.rolname, 'PUBLIC') || ':' || x.privilege_type
                )
                  filter (where x.privilege_type is not null),
                array[]::text[]
              ) as grants
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            join pg_roles owner on owner.oid = p.proowner
            left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x on true
            left join pg_roles grantee on grantee.oid = x.grantee
            where n.nspname in ('public', 'storage', 'auth')
              and p.prokind in ('f', 'p')
            group by n.nspname, p.oid, p.prosecdef, owner.rolname, p.proconfig
            order by 1
            """
        )
        functions = cursor.fetchall()

        cursor.execute(
            """
            select
              event_object_schema || '.' || trigger_name as name,
              action_statement,
              event_object_schema || '.' || event_object_table as relation
            from information_schema.triggers
            where event_object_schema in ('public', 'storage', 'auth')
            order by 1
            """
        )
        triggers = cursor.fetchall()

        cursor.execute(
            """
            select schemaname, tablename, policyname, roles, qual, with_check
            from pg_policies
            where schemaname in ('public', 'storage', 'auth')
            order by schemaname, tablename, policyname
            """
        )
        policies = cursor.fetchall()

        cursor.execute(
            """
            select
              owner.rolname as owner,
              n.nspname as schema,
              case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' else d.defaclobjtype::text end as object_type,
              coalesce(grantee.rolname, 'PUBLIC') as grantee,
              x.privilege_type as privilege
            from pg_default_acl d
            join pg_roles owner on owner.oid = d.defaclrole
            left join pg_namespace n on n.oid = d.defaclnamespace
            cross join lateral aclexplode(d.defaclacl) x
            left join pg_roles grantee on grantee.oid = x.grantee
            order by 1, 2, 3, 4, 5
            """
        )
        default_acls = cursor.fetchall()
        cursor.execute("rollback")

print(
    json.dumps(
        {
            "functions": functions,
            "triggers": triggers,
            "policies": policies,
            "defaultAcls": default_acls,
            "target": arguments.target,
        },
        default=str,
        sort_keys=True,
    )
)
