from lab_escrituras.ocr import normalize_pages


def test_normalize_pages_defaults_to_all_pages():
    assert normalize_pages(None, 3) == [1, 2, 3]


def test_normalize_pages_filters_invalid_and_deduplicates():
    assert normalize_pages([3, 1, 3, 0, 7], 4) == [1, 3]
