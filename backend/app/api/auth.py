"""Валідація Telegram initData: HMAC-SHA256 підпис ботовим токеном + свіжість auth_date."""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from ..config import settings


class InitDataError(Exception):
    pass


def validate_init_data(init_data: str, max_age: int | None = None) -> dict:
    """Повертає розпарсені дані (включно з user) або кидає InitDataError."""
    if not init_data:
        raise InitDataError("empty initData")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise InitDataError("no hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise InitDataError("bad signature")

    auth_date = int(pairs.get("auth_date", "0"))
    if time.time() - auth_date > (max_age or settings.init_data_max_age):
        raise InitDataError("initData expired")

    if "user" in pairs:
        pairs["user"] = json.loads(pairs["user"])
    return pairs
