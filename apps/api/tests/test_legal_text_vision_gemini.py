from __future__ import annotations

from services.legal_text_vision import transcribe_pdf_with_vision_sync
from services.llm_control_plane import LLMTask, Provider, ResolvedTaskConfiguration


def test_gemini_transcribes_native_pdf_with_structured_output_and_thinking(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": (
                                        '{"pages":[{"page_number":2,"text":"segunda"},'
                                        '{"page_number":1,"text":"primera"}]}'
                                    )
                                }
                            ]
                        }
                    }
                ]
            }

    def fake_post(url, *, headers, json, timeout):
        captured.update(
            {
                "url": url,
                "headers": headers,
                "request": json,
                "timeout": timeout,
            }
        )
        return FakeResponse()

    monkeypatch.setattr(
        "services.legal_text_vision.requests.post",
        fake_post,
    )

    result = transcribe_pdf_with_vision_sync(
        b"%PDF-test",
        ResolvedTaskConfiguration(
            task=LLMTask.PDF_VISION,
            provider=Provider.GEMINI,
            model="gemini-3.6-flash",
            reasoning_effort="high",
            api_key="gemini-key",
            enabled=True,
            version=1,
        ),
    )

    assert result == [(1, "primera"), (2, "segunda")]
    assert captured["url"].endswith("/models/gemini-3.6-flash:generateContent")
    assert captured["headers"]["x-goog-api-key"] == "gemini-key"
    request = captured["request"]
    inline_data = request["contents"][0]["parts"][0]["inline_data"]
    assert inline_data["mime_type"] == "application/pdf"
    assert inline_data["data"]
    assert request["generationConfig"]["thinkingConfig"] == {
        "thinkingLevel": "high"
    }
