import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import time
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

def _read_env_value(name: str, fallback: str) -> str:
    raw = (os.getenv(name) or "").strip()
    # Ignore placeholder/template values from example env files.
    if not raw or raw.startswith("("):
        return fallback
    return raw


_TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "86400"))
_TOKEN_SECRET = _read_env_value("AUTH_SECRET", "")
if not _TOKEN_SECRET:
    _TOKEN_SECRET = secrets.token_hex(32)
_DEFAULT_USERNAME = _read_env_value("AUTH_DEFAULT_USERNAME", "admin")
_DEFAULT_PASSWORD = _read_env_value("AUTH_DEFAULT_PASSWORD", "admin")

security = HTTPBearer(auto_error=False)


if not (os.getenv("AUTH_SECRET") or "").strip() or (os.getenv("AUTH_SECRET") or "").strip().startswith("("):
    logger.warning("AUTH_SECRET not set; using ephemeral secret (tokens invalid after restart)")


if _DEFAULT_PASSWORD == "admin":
    logger.warning("AUTH_DEFAULT_PASSWORD is using default value 'admin'; change it in production")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    salt_value = salt or secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt_value}:{password}".encode("utf-8")).hexdigest()
    return digest, salt_value


def _verify_password(password: str, stored_hash: str, stored_salt: str) -> bool:
    computed_hash, _ = _hash_password(password, stored_salt)
    return hmac.compare_digest(computed_hash, stored_hash)


def _sign(message: str) -> str:
    signature = hmac.new(_TOKEN_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(signature)


def _encode_token(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}"
    signature_b64 = _sign(signing_input)
    return f"{signing_input}.{signature_b64}"


def create_access_token(username: str, ttl_seconds: Optional[int] = None) -> dict:
    ttl = int(ttl_seconds or _TOKEN_TTL_SECONDS)
    now = int(time.time())
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + ttl,
    }
    token = _encode_token(payload)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ttl,
    }


def verify_access_token(token: str) -> dict:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format") from exc

    signing_input = f"{header_b64}.{payload_b64}"
    expected_sig = _sign(signing_input)
    if not hmac.compare_digest(expected_sig, signature_b64):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    try:
        payload_raw = _b64url_decode(payload_b64)
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from exc

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    username = payload.get("sub")
    if not isinstance(username, str) or not username.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    return payload


def _connect(database_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(database_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_storage(database_path: str) -> None:
    conn = _connect(database_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_user (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        row = conn.execute("SELECT id FROM auth_user WHERE id = 1").fetchone()
        if row is None:
            password_hash, salt = _hash_password(_DEFAULT_PASSWORD)
            conn.execute(
                """
                INSERT INTO auth_user (id, username, password_hash, password_salt, updated_at)
                VALUES (1, ?, ?, ?, ?)
                """,
                (_DEFAULT_USERNAME, password_hash, salt, int(time.time())),
            )
            logger.info("Initialized single-user auth credentials")
        conn.commit()
    finally:
        conn.close()


def _get_user_row(database_path: str) -> Optional[sqlite3.Row]:
    conn = _connect(database_path)
    try:
        return conn.execute("SELECT id, username, password_hash, password_salt FROM auth_user WHERE id = 1").fetchone()
    finally:
        conn.close()


def authenticate_user(database_path: str, username: str, password: str) -> bool:
    row = _get_user_row(database_path)
    if row is None:
        return False

    stored_username = row["username"]
    if not hmac.compare_digest(username.strip(), stored_username):
        return False

    return _verify_password(password, row["password_hash"], row["password_salt"])


def update_user_credentials(
    database_path: str,
    current_username: str,
    current_password: str,
    new_username: str,
    new_password: str,
) -> bool:
    row = _get_user_row(database_path)
    if row is None:
        return False

    if not hmac.compare_digest(current_username.strip(), row["username"]):
        return False

    if not _verify_password(current_password, row["password_hash"], row["password_salt"]):
        return False

    password_hash, salt = _hash_password(new_password)

    conn = _connect(database_path)
    try:
        conn.execute(
            """
            UPDATE auth_user
            SET username = ?, password_hash = ?, password_salt = ?, updated_at = ?
            WHERE id = 1
            """,
            (new_username.strip(), password_hash, salt, int(time.time())),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    return verify_access_token(credentials.credentials)
