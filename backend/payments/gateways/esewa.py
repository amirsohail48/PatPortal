import base64
import hmac
import hashlib
import logging
import os
import requests
from decimal import Decimal
from typing import Any

from payments.exceptions import GatewayError

logger = logging.getLogger(__name__)


ESEWA_PRODUCT_CODE = os.getenv("ESEWA_INTENT_PRODUCT_CODE", "INTENT").strip()
ESEWA_ACCESS_KEY = os.getenv("ESEWA_INTENT_ACCESS_KEY", "").strip()
ESEWA_BOOK_URL = os.getenv(
    "ESEWA_INTENT_BOOK_URL",
    "https://rc-checkout.esewa.com.np/api/client/intent/payment/book",
).strip()
ESEWA_STATUS_URL = os.getenv(
    "ESEWA_INTENT_STATUS_URL",
    "https://rc-checkout.esewa.com.np/api/client/intent/payment/status",
).strip()
ESEWA_CALLBACK_URL = os.getenv("ESEWA_CALLBACK_URL", "").strip()
ESEWA_REDIRECT_URL = os.getenv("ESEWA_REDIRECT_URL", "").strip()

ESEWA_EPAY_PRODUCT_CODE = os.getenv("ESEWA_EPAY_PRODUCT_CODE", "EPAYTEST").strip()
ESEWA_EPAY_SECRET_KEY = os.getenv("ESEWA_EPAY_SECRET_KEY", "").strip()
ESEWA_EPAY_FORM_URL = os.getenv(
    "ESEWA_EPAY_FORM_URL",
    "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
).strip()
ESEWA_EPAY_SUCCESS_URL = os.getenv("ESEWA_EPAY_SUCCESS_URL", "").strip()
ESEWA_EPAY_FAILURE_URL = os.getenv("ESEWA_EPAY_FAILURE_URL", "").strip()


def normalize_amount(amount):
    amount = Decimal(str(amount))

    if amount == amount.to_integral():
        return int(amount)

    return float(amount)


def build_signature_message(payload, signed_field_names):
    fields = [field.strip() for field in signed_field_names.split(",")]

    # Format A: shown in eSewa docs
    message_with_spaces = ", ".join(
        f"{field}={payload[field]}"
        for field in fields
    )

    # Format B: common gateway verifier style
    message_without_spaces = ",".join(
        f"{field}={payload[field]}"
        for field in fields
    )

    # First try without spaces if eSewa keeps rejecting Format A
    return message_without_spaces


def generate_signature(payload, signed_field_names):
    if not ESEWA_ACCESS_KEY:
        raise ValueError("ESEWA_INTENT_ACCESS_KEY is missing or not loaded")

    message = build_signature_message(payload, signed_field_names)

    logger.debug(
        "eSewa signature | fields=%s message=%s product=%s",
        signed_field_names, message, ESEWA_PRODUCT_CODE,
    )

    digest = hmac.new(
        ESEWA_ACCESS_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    signature = base64.b64encode(digest).decode("utf-8")

    return signature


def verify_esewa_signature(payload):
    signed_field_names = payload.get("signed_field_names")

    if not signed_field_names:
        return False

    received_signature = payload.get("signature", "")
    expected_signature = generate_signature(payload, signed_field_names)

    return hmac.compare_digest(received_signature, expected_signature)


def book_intent_payment(amount, transaction_uuid, customer_id, remarks) -> tuple[dict[str, Any], dict[str, Any]]:
    signed_field_names = "product_code,amount,transaction_uuid"

    payload = {
        "product_code": ESEWA_PRODUCT_CODE,
        "amount": normalize_amount(amount),
        "transaction_uuid": str(transaction_uuid),
        "signed_field_names": signed_field_names,
        "signature": "",
        "callback_url": ESEWA_CALLBACK_URL,
        "redirect_url": ESEWA_REDIRECT_URL,
        "properties": {
            "customer_id": str(customer_id),
            "remarks": str(remarks),
        },
    }

    payload["signature"] = generate_signature(payload, signed_field_names)

    logger.debug("eSewa book payload transaction_uuid=%s", transaction_uuid)

    response = requests.post(
        ESEWA_BOOK_URL,
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=60,
    )

    try:
        response_data = response.json()
    except Exception:
        response_data = {"raw": response.text}

    if response.status_code >= 400:
        logger.error("eSewa book failed status=%s body=%s", response.status_code, response_data)
        if response.status_code in (502, 503, 504):
            raise GatewayError("eSewa payment service is temporarily unavailable. Please try again later.")
        raise GatewayError("eSewa payment initiation failed. Please try again.")

    success_codes = ["IP-200", "IP-201"]

    if response_data.get("code") not in success_codes:
        logger.error("eSewa book unexpected code status=%s body=%s", response.status_code, response_data)
        raise GatewayError("eSewa payment initiation failed. Please try again.")

    return payload, response_data

def check_intent_status(booking_id, correlation_id):
    signed_field_names = "booking_id,product_code,correlation_id"

    payload = {
        "booking_id": str(booking_id),
        "product_code": ESEWA_PRODUCT_CODE,
        "correlation_id": str(correlation_id),
        "signed_field_names": signed_field_names,
        "signature": "",
    }

    payload["signature"] = generate_signature(payload, signed_field_names)

    response = requests.post(
        ESEWA_STATUS_URL,
        json=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=60,
    )

    try:
        response_data = response.json()
    except Exception:
        response_data = {"raw": response.text}

    if response.status_code >= 400:
        logger.error("eSewa status check failed status=%s body=%s", response.status_code, response_data)
        if response.status_code in (502, 503, 504):
            raise GatewayError("eSewa payment service is temporarily unavailable. Please try again later.")
        raise GatewayError("eSewa payment status check failed. Please try again.")

    return payload, response_data


def normalize_epay_amount(amount):
    amount = Decimal(str(amount)).quantize(Decimal("0.01"))

    if amount == amount.to_integral():
        return str(int(amount))

    return format(amount, "f")


def generate_epay_signature(total_amount, transaction_uuid, product_code):
    """
    ePay V2 signature message format:
    total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST
    """

    if not ESEWA_EPAY_SECRET_KEY:
        raise ValueError("ESEWA_EPAY_SECRET_KEY is missing or not loaded")

    message = (
        f"total_amount={total_amount},"
        f"transaction_uuid={transaction_uuid},"
        f"product_code={product_code}"
    )

    logger.debug("eSewa ePay signature | product=%s message=%s", product_code, message)

    digest = hmac.new(
        ESEWA_EPAY_SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    signature = base64.b64encode(digest).decode("utf-8")

    return signature


def build_epay_v2_form_fields(
    amount,
    transaction_uuid,
    tax_amount=0,
    product_service_charge=0,
    product_delivery_charge=0,
):
    amount_text = normalize_epay_amount(amount)
    tax_text = normalize_epay_amount(tax_amount)
    service_charge_text = normalize_epay_amount(product_service_charge)
    delivery_charge_text = normalize_epay_amount(product_delivery_charge)

    total_amount = (
        Decimal(str(amount_text))
        + Decimal(str(tax_text))
        + Decimal(str(service_charge_text))
        + Decimal(str(delivery_charge_text))
    )

    total_amount_text = normalize_epay_amount(total_amount)

    signed_field_names = "total_amount,transaction_uuid,product_code"

    fields = {
        "amount": amount_text,
        "tax_amount": tax_text,
        "total_amount": total_amount_text,
        "transaction_uuid": str(transaction_uuid),
        "product_code": ESEWA_EPAY_PRODUCT_CODE,
        "product_service_charge": service_charge_text,
        "product_delivery_charge": delivery_charge_text,
        "success_url": ESEWA_EPAY_SUCCESS_URL,
        "failure_url": ESEWA_EPAY_FAILURE_URL,
        "signed_field_names": signed_field_names,
    }

    fields["signature"] = generate_epay_signature(
        total_amount=fields["total_amount"],
        transaction_uuid=fields["transaction_uuid"],
        product_code=fields["product_code"],
    )

    return {
        "action_url": ESEWA_EPAY_FORM_URL,
        "fields": fields,
    }


def verify_epay_response_signature(payload):
    """
    Verifies the HMAC-SHA256 signature on eSewa ePay V2 redirect/response data.
    Uses ESEWA_EPAY_SECRET_KEY (different from the Intent access key).
    """
    signed_field_names = payload.get("signed_field_names", "")
    if not signed_field_names:
        return False

    received_signature = payload.get("signature", "")
    if not received_signature:
        return False

    if not ESEWA_EPAY_SECRET_KEY:
        raise ValueError("ESEWA_EPAY_SECRET_KEY is missing or not loaded")

    fields = [f.strip() for f in signed_field_names.split(",")]
    message = ",".join(f"{field}={payload.get(field, '')}" for field in fields)

    digest = hmac.new(
        ESEWA_EPAY_SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    expected_signature = base64.b64encode(digest).decode("utf-8")

    return hmac.compare_digest(received_signature, expected_signature)