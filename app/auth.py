import os

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
API_AUDIENCE = os.getenv("AUTH0_API_AUDIENCE")
ALGORITHMS = ["RS256"]

class UnauthorizedException(HTTPException):
    def __init__(self, detail: str, **kwargs):
        """Returns HTTP 401"""
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail=detail, **kwargs)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        jwks_url = f"{AUTH0_DOMAIN}/.well-known/jwks.json"
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
            audience=API_AUDIENCE,
            issuer=f"{AUTH0_DOMAIN}"
        )
        return payload

    except jwt.ExpiredSignatureError as e:
        raise UnauthorizedException(detail="Token has expired") from e
    except jwt.MissingRequiredClaimError as e:
        raise UnauthorizedException(detail="Invalid claims, please check the audience and issuer") from e
    except Exception as e:
        raise UnauthorizedException(detail=f"Unable to parse authentication token: {e}") from e