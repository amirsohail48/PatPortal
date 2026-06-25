import logging
import uuid
from decimal import Decimal

import requests

from django.conf import settings

from payments.exceptions import GatewayError

logger = logging.getLogger(__name__)


def amount_to_paisa(amount):
    value = Decimal(str(amount))
    return int(value * 100)


def generate_order_id(prefix="KPT"):
    return f"{prefix}{uuid.uuid4().hex[:16]}"[:20]


def khalti_initiate(purchase_order_id, purchase_order_name, amount_paisa, return_url, customer_info=None):
    """
    Initiates a Khalti ePay payment.
    Returns (pidx, payment_url, raw_response).
    """
    if not settings.KHALTI_SECRET_KEY:
        raise GatewayError("Khalti is not configured. Please contact support.")

    payload = {
        "return_url": return_url,
        "website_url": return_url,
        "amount": amount_paisa,
        "purchase_order_id": purchase_order_id,
        "purchase_order_name": purchase_order_name,
    }

    if customer_info:
        payload["customer_info"] = customer_info

    logger.debug("Khalti initiate purchase_order_id=%s amount_paisa=%s", purchase_order_id, amount_paisa)

    response = requests.post(
        settings.KHALTI_INITIATE_URL,
        json=payload,
        headers={
            "Authorization": f"Key {settings.KHALTI_SECRET_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30,
    )

    try:
        data = response.json()
    except Exception:
        data = {"detail": response.text}

    if response.status_code >= 400:
        logger.error("Khalti initiate failed status=%s body=%s", response.status_code, data)
        if response.status_code in (500, 502, 503, 504):
            raise GatewayError("Khalti payment service is temporarily unavailable. Please try again later.")
        detail = data.get("detail") or data.get("error") or "Please try again."
        raise GatewayError(f"Khalti payment initiation failed: {detail}")

    pidx = data.get("pidx")
    payment_url = data.get("payment_url")

    if not pidx or not payment_url:
        raise GatewayError("Khalti did not return payment URL. Please try again.")

    return pidx, payment_url, data


def khalti_lookup(pidx):
    """
    Verifies a Khalti ePay payment by pidx.

    Khalti status values: Completed, Pending, Initiated, Refunded, Expired, User canceled, Partially Refunded.
    """
    if not settings.KHALTI_SECRET_KEY:
        raise GatewayError("Khalti is not configured. Please contact support.")

    payload = {"pidx": pidx}

    response = requests.post(
        settings.KHALTI_LOOKUP_URL,
        json=payload,
        headers={
            "Authorization": f"Key {settings.KHALTI_SECRET_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30,
    )

    try:
        data = response.json()
    except Exception:
        data = {"detail": response.text}

    if response.status_code >= 400:
        logger.error("Khalti lookup failed status=%s body=%s", response.status_code, data)
        if response.status_code in (500, 502, 503, 504):
            raise GatewayError("Khalti payment service is temporarily unavailable. Please try again later.")
        detail = data.get("detail") or data.get("error") or "Please try again."
        raise GatewayError(f"Khalti payment verification failed: {detail}")

    return data
