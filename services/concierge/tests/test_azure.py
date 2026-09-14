import json
import os
import unittest
from unittest.mock import patch

import httpx
from azure.ai.inference.models import ChatCompletions
from openai import OpenAI

from app import app
from llm_config import AzureConfigurationError, AzureSettings, configuration_status, create_llm


CONFIG = {
    "AZURE_ENDPOINT": "https://example.services.ai.azure.com/models",
    "AZURE_API_KEY": "azure-test-key",
    "AZURE_MODEL": "reception-prod",
    "AZURE_API_MODE": "inference",
    "AZURE_API_VERSION": "2024-05-01-preview",
    # Valores antigos não podem escolher outro endpoint ou outra credencial.
    "OPENAI_API_KEY": "old-openai-key",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "CREWAI_MODEL": "openai/old-model",
}

COMPLETION = {
    "id": "test-completion", "created": 0, "object": "chat.completion", "model": "reception-prod",
    "choices": [{"index": 0, "message": {"role": "assistant", "content": "Resposta de teste"}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
}


class AzureConfigurationTests(unittest.TestCase):
    def test_old_openai_key_does_not_configure_azure(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "old-key"}, clear=True):
            status = configuration_status()
            self.assertFalse(status["ready"])
            self.assertEqual(status["configuration_fields"], ["AZURE_ENDPOINT", "AZURE_API_KEY", "AZURE_MODEL"])
            with self.assertRaises(AzureConfigurationError):
                create_llm()

    def test_inference_uses_azure_sdk_and_exact_deployment(self):
        with patch.dict(os.environ, CONFIG, clear=True):
            llm = create_llm()
        self.assertEqual(type(llm).__name__, "AzureCompletion")
        self.assertEqual(llm.model, "reception-prod")
        self.assertEqual(llm.endpoint, CONFIG["AZURE_ENDPOINT"])
        self.assertEqual(llm.api_key, "azure-test-key")
        self.assertEqual(llm.api_version, "2024-05-01-preview")
        self.assertEqual(llm.max_retries, 0)
        with patch.object(llm._client, "complete", return_value=ChatCompletions(COMPLETION)) as complete:
            self.assertEqual(llm.call("Olá"), "Resposta de teste")
        self.assertEqual(complete.call_args.kwargs["model"], "reception-prod")

    def test_v1_http_request_targets_azure_without_api_version(self):
        config = {**CONFIG, "AZURE_API_MODE": "openai_v1", "AZURE_ENDPOINT": "https://example.openai.azure.com"}
        with patch.dict(os.environ, config, clear=True):
            llm = create_llm()
        self.assertEqual(type(llm).__name__, "OpenAICompletion")
        self.assertEqual(llm.api_key, "azure-test-key")
        self.assertEqual(str(llm._client.base_url), "https://example.openai.azure.com/openai/v1/")
        calls = []

        def respond(request):
            calls.append(request)
            self.assertEqual(str(request.url), "https://example.openai.azure.com/openai/v1/chat/completions")
            self.assertEqual(request.headers["authorization"], "Bearer azure-test-key")
            self.assertEqual(json.loads(request.content)["model"], "reception-prod")
            return httpx.Response(200, json=COMPLETION)

        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            llm._client = OpenAI(api_key=llm.api_key, base_url=llm.base_url, http_client=client, max_retries=0)
            self.assertEqual(llm.call("Olá"), "Resposta de teste")
        self.assertEqual(len(calls), 1)

    def test_resource_and_dedicated_endpoint_normalization(self):
        for endpoint, mode, expected in [
            ("https://example.services.ai.azure.com", "inference", "/models/"),
            ("https://example.eastus.models.ai.azure.com", "inference", ".com/"),
            ("https://example.services.ai.azure.com/openai/v1/", "openai_v1", "/openai/v1/"),
        ]:
            with self.subTest(endpoint=endpoint), patch.dict(os.environ, {**CONFIG, "AZURE_ENDPOINT": endpoint, "AZURE_API_MODE": mode}, clear=True):
                self.assertTrue(AzureSettings.from_env().endpoint.endswith(expected))

    def test_project_and_wrong_protocol_endpoints_fail_before_call(self):
        for endpoint in [
            "https://example.services.ai.azure.com/api/projects/demo",
            "https://example.services.ai.azure.com/models/chat/completions",
            "https://example.services.ai.azure.com/models?api-key=secret",
            "https://example.services.ai.azure.com/openai/v1",
            "http://example.services.ai.azure.com/models",
        ]:
            with self.subTest(endpoint=endpoint), patch.dict(os.environ, {**CONFIG, "AZURE_ENDPOINT": endpoint}, clear=True):
                self.assertFalse(configuration_status()["ready"])
                with self.assertRaises(AzureConfigurationError):
                    create_llm()

    def test_missing_fields_invalid_mode_and_provider_prefix(self):
        for field, value in [("AZURE_API_KEY", " "), ("AZURE_API_MODE", "invalid"), ("AZURE_API_VERSION", ""), ("AZURE_MODEL", "azure/deployment")]:
            with self.subTest(field=field), patch.dict(os.environ, {**CONFIG, field: value}, clear=True):
                self.assertIn(field, configuration_status()["configuration_fields"])

    def test_status_and_repr_do_not_expose_key(self):
        with patch.dict(os.environ, CONFIG, clear=True):
            self.assertNotIn("azure-test-key", repr(AzureSettings.from_env()))
            status = configuration_status()
        self.assertTrue(status["ready"])
        self.assertNotIn("azure-test-key", json.dumps(status))
        self.assertNotIn("example.services", json.dumps(status))


class AzureHealthTests(unittest.IsolatedAsyncioTestCase):
    async def test_health_reports_azure_configuration_without_calling_model(self):
        with patch.dict(os.environ, CONFIG, clear=True), patch("llm_config.LLM") as llm:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/health")
        self.assertEqual(response.json()["provider"], "azure_foundry")
        self.assertTrue(response.json()["ready"])
        llm.assert_not_called()
