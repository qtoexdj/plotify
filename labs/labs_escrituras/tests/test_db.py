from lab_escrituras import db


class FakeCursor:
    def __init__(self, *, rowcount=0):
        self.rowcount = rowcount
        self.statements: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, _params=None):
        self.statements.append(sql)


class FakeConnection:
    def __init__(self, cursor: FakeCursor):
        self.cursor_instance = cursor

    def cursor(self):
        return self.cursor_instance


def test_ensure_lab_schema_current_readds_processing_status_constraint():
    cursor = FakeCursor()
    conn = FakeConnection(cursor)

    db.ensure_lab_schema_current(conn)

    statements = "\n".join(cursor.statements)
    assert "drop constraint if exists source_documents_status_check" in statements
    assert "add constraint source_documents_status_check" in statements
    assert "low_quality_extraction" in statements
    assert "failed" in statements


def test_reset_interrupted_processing_documents_only_recovers_queue_state():
    cursor = FakeCursor(rowcount=2)
    conn = FakeConnection(cursor)

    recovered = db.reset_interrupted_processing_documents(conn)

    assert recovered == 2
    statements = "\n".join(cursor.statements)
    assert "where processing_status = 'processing'" in statements
    assert "add constraint source_documents_status_check" not in statements
