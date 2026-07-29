#!/usr/bin/env python3
"""Plan historical escritura generation revalidation (dry-run by default)."""

from __future__ import annotations

import argparse


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Inspect immutable historical minuta bytes and provenance without overwriting generations."
    )
    result.add_argument("--generation-id", action="append", default=[])
    result.add_argument("--apply-validation-links", action="store_true", help="Persist only new immutable validation links; never overwrite artifacts.")
    return result


def main() -> int:
    args = parser().parse_args()
    mode = "apply-validation-links" if args.apply_validation_links else "dry-run"
    print(f"historical-revalidation mode={mode} selected={len(args.generation_id)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
