import os
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


AUTH0_DOMAIN: str | None = os.getenv("AUTH0_DOMAIN")
API_AUDIENCE: str | None = os.getenv("AUTH0_API_AUDIENCE")
ALGORITHMS = ["RS256"]


@dataclass(frozen=True)
class Auth0Settings:
    domain: str
    audience: str

    @property
    def issuer(self) -> str:
        return f"{self.domain}/"


def _require_value(name: str, value: str | None) -> str:
    if value is None or not value.strip():
        raise RuntimeError(f"Environment variable '{name}' is required for Auth0 configuration.")
    return value.strip()


def _require_https(name: str, value: str) -> str:
    if not value.startswith("https://"):
        raise RuntimeError(f"Environment variable '{name}' must start with 'https://'.")
    return value


def _load_auth0_settings() -> Auth0Settings:
    domain_raw = AUTH0_DOMAIN or os.getenv("AUTH0_DOMAIN")
    domain = _require_https("AUTH0_DOMAIN", _require_value("AUTH0_DOMAIN", domain_raw)).rstrip("/")

    audience_raw = API_AUDIENCE or os.getenv("AUTH0_API_AUDIENCE")
    audience = _require_https(
        "AUTH0_API_AUDIENCE",
        _require_value("AUTH0_API_AUDIENCE", audience_raw),
    )
    return Auth0Settings(domain=domain, audience=audience)


@lru_cache(maxsize=1)
def get_auth0_settings() -> Auth0Settings:
    settings = _load_auth0_settings()
    global AUTH0_DOMAIN, API_AUDIENCE
    AUTH0_DOMAIN = settings.domain
    API_AUDIENCE = settings.audience
    return settings


def reset_auth0_settings_cache() -> None:
    global AUTH0_DOMAIN, API_AUDIENCE
    get_auth0_settings.cache_clear()
    AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
    API_AUDIENCE = os.getenv("AUTH0_API_AUDIENCE")


def ensure_auth0_configured() -> None:
    get_auth0_settings()

class UnauthorizedException(HTTPException):
    def __init__(self, detail: str, **kwargs):
        """Returns HTTP 401"""
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail=detail, **kwargs)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        settings = get_auth0_settings()
        jwks_url = f"{settings.domain}/.well-known/jwks.json"
        jwks_client = jwt.PyJWKClient(jwks_url)
        
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
        except jwt.exceptions.PyJWKClientError as e:
            raise UnauthorizedException(detail=str(e)) from e
        except Exception as e:
            raise UnauthorizedException(detail="Unable to find appropriate key") from e

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALGORITHMS,
            audience=settings.audience,
            issuer=settings.issuer,
        )
        return payload

    except jwt.ExpiredSignatureError as e:
        raise UnauthorizedException(detail="Token has expired") from e
    except jwt.MissingRequiredClaimError as e:
        raise UnauthorizedException(detail="Invalid claims, please check the audience and issuer") from e
    except Exception as e:
        raise UnauthorizedException(detail=f"Unable to parse authentication token: {e}") from e
