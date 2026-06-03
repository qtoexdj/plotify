from lab_escrituras.embeddings import vector_literal


def test_vector_literal_formats_pgvector_value():
    assert vector_literal([0.1, -2.5, 3.0]) == "[0.1000000000,-2.5000000000,3.0000000000]"
