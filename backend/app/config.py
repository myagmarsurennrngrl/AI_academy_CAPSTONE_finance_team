"""Centralized application settings, loaded from environment / .env."""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-fable-5"
    anthropic_workspace_id: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-5.6-terra"

    use_mock_ai: bool = False
    # Temporary workaround flag: when true, OpenAI generates BOTH the English
    # analysis and the Mongolian translation, bypassing Anthropic entirely.
    # Intended only as a stopgap while an Anthropic workspace-id issue is
    # resolved - flip back to false to restore the normal Claude+OpenAI split.
    use_openai_for_analysis: bool = False

    max_upload_mb: int = 15
    cors_origins: str = "http://localhost:3000"

    # --- Authentication ---------------------------------------------------
    # Every analysis endpoint requires a signed-in user. Accounts are created
    # by an administrator only (no self sign-up). The first administrator is
    # bootstrapped from ADMIN_USERNAME / ADMIN_PASSWORD when the user store is
    # empty. AUTH_DISABLED=true opens the API without login (tests / demos).
    auth_disabled: bool = False
    users_file: str = "data/users.json"
    auth_secret: str = ""  # optional; a random secret is generated + persisted if empty
    auth_token_hours: int = 12
    admin_username: str = ""
    admin_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
