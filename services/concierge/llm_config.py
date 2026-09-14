import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit, urlunsplit

from crewai import LLM


class AzureConfigurationError(ValueError):
    """Erros contêm somente nomes de variáveis, nunca valores de credenciais."""

    def __init__(self, fields: list[str]):
        self.fields = fields
        super().__init__("Verifique: " + ", ".join(fields))


@dataclass(frozen=True)
class AzureSettings:
    endpoint: str
    model: str
    api_key: str = field(repr=False)
    mode: str = "inference"
    api_version: str = "2024-05-01-preview"

    @classmethod
    def from_env(cls):
        values = {name: os.getenv(name, "").strip() for name in ("AZURE_ENDPOINT", "AZURE_API_KEY", "AZURE_MODEL")}
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise AzureConfigurationError(missing)
        mode = os.getenv("AZURE_API_MODE", "inference").strip()
        if mode not in ("inference", "openai_v1"):
            raise AzureConfigurationError(["AZURE_API_MODE"])
        model = values["AZURE_MODEL"]
        # Nome do deployment, sem prefixos de roteamento do CrewAI.
        if "/" in model or any(c.isspace() for c in model):
            raise AzureConfigurationError(["AZURE_MODEL"])
        try:
            parts = urlsplit(values["AZURE_ENDPOINT"])
            valid = parts.scheme == "https" and parts.hostname and not parts.username and not parts.password and not parts.query and not parts.fragment
        except ValueError:
            valid = False
        if not valid:
            raise AzureConfigurationError(["AZURE_ENDPOINT"])
        path = parts.path.rstrip("/")
        # Uma URL de projeto não atende chat completions. Evitar endpoints de operação duplicados.
        if "/api/projects" in path or path.endswith(("/chat/completions", "/responses")) or "/deployments/" in path:
            raise AzureConfigurationError(["AZURE_ENDPOINT"])
        if mode == "openai_v1":
            if not path:
                path = "/openai/v1"
            if not path.endswith("/openai/v1"):
                raise AzureConfigurationError(["AZURE_ENDPOINT", "AZURE_API_MODE"])
        else:
            if "/openai/" in path or (parts.hostname or "").endswith(".openai.azure.com"):
                raise AzureConfigurationError(["AZURE_ENDPOINT", "AZURE_API_MODE"])
            # Foundry resource multi-model usa /models; endpoints dedicados preservam a raiz.
            if not path and (parts.hostname or "").endswith(".services.ai.azure.com"):
                path = "/models"
        version = os.getenv("AZURE_API_VERSION", "2024-05-01-preview").strip()
        if mode == "inference" and not version:
            raise AzureConfigurationError(["AZURE_API_VERSION"])
        return cls(endpoint=urlunsplit((parts.scheme, parts.netloc, path + "/", "", "")), model=model, api_key=values["AZURE_API_KEY"], mode=mode, api_version=version)

    def create_llm(self):
        common = {"api_key": self.api_key, "timeout": 10, "max_retries": 0}
        if self.mode == "openai_v1":
            # O SDK OpenAI fala diretamente com o endpoint Azure explicitamente informado.
            # O provider explícito impede inferir outro provedor a partir do nome do deployment.
            return LLM(model=self.model, provider="openai", base_url=self.endpoint, **common)
        return LLM(model=self.model, provider="azure", endpoint=self.endpoint.rstrip("/"), api_version=self.api_version, **common)


def create_llm():
    return AzureSettings.from_env().create_llm()


def configuration_status():
    try:
        settings = AzureSettings.from_env()
        return {"service": "crewai", "provider": "azure_foundry", "ready": True, "mode": settings.mode, "configuration_fields": []}
    except AzureConfigurationError as error:
        return {"service": "crewai", "provider": "azure_foundry", "ready": False, "configuration_fields": error.fields}
