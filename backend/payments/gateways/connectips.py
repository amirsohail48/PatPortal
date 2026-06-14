import base64
import uuid
from decimal import Decimal
from datetime import datetime

import requests

from django.conf import settings
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12


def amount_to_paisa(amount):
    """
    connectIPS TXNAMT is integer amount in paisa.
    Example:
    NPR 50.00 -> 5000
    """
    value = Decimal(str(amount))
    return int(value * 100)


def generate_txn_id(prefix="CIPS"):
    """
    TXNID max length in docs is 20.
    """
    return f"{prefix}{uuid.uuid4().hex[:16]}"[:20]


def get_txn_date():
    """
    connectIPS expects DD-MM-YYYY.
    """
    return datetime.now().strftime("%d-%m-%Y")


def load_private_key():
    if not settings.CONNECTIPS_PFX_PATH:
        raise ValueError("CONNECTIPS_PFX_PATH is not configured")

    with open(settings.CONNECTIPS_PFX_PATH, "rb") as file:
        pfx_data = file.read()

    password = None
    if settings.CONNECTIPS_PFX_PASSWORD:
        password = settings.CONNECTIPS_PFX_PASSWORD.encode("utf-8")

    private_key, certificate, extra_certificates = pkcs12.load_key_and_certificates(
        pfx_data,
        password,
    )

    if private_key is None:
        raise ValueError("Private key not found inside PFX file")

    return private_key


def rsa_sign_base64(message):
    """
    connectIPS token:
    SHA256withRSA signature, then base64.
    """

    private_key = load_private_key()

    signature = private_key.sign(
        message.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )

    return base64.b64encode(signature).decode("utf-8")

def clean_connectips_value(value):
    if value is None:
        return ""

    return str(value).strip()

def build_payment_token_message(fields):
    """
    Format must match connectIPS documentation.
    """

    return (
        f"MERCHANTID={clean_connectips_value(fields['MERCHANTID'])},"
        f"APPID={clean_connectips_value(fields['APPID'])},"
        f"APPNAME={clean_connectips_value(fields['APPNAME'])},"
        f"TXNID={clean_connectips_value(fields['TXNID'])},"
        f"TXNDATE={clean_connectips_value(fields['TXNDATE'])},"
        f"TXNCRNCY={clean_connectips_value(fields['TXNCRNCY'])},"
        f"TXNAMT={clean_connectips_value(fields['TXNAMT'])},"
        f"REFERENCEID={clean_connectips_value(fields['REFERENCEID'])},"
        f"REMARKS={clean_connectips_value(fields['REMARKS'])},"
        f"PARTICULARS={clean_connectips_value(fields['PARTICULARS'])},"
        f"TOKEN=TOKEN"
    )


def build_validation_token_message(merchant_id, app_id, reference_id, txn_amt):
    return (
        f"MERCHANTID={merchant_id},"
        f"APPID={app_id},"
        f"REFERENCEID={reference_id},"
        f"TXNAMT={txn_amt}"
    )


def build_connectips_payment_fields(
    txn_id,
    amount,
    reference_id,
    remarks,
    particulars,
):
    amount_paisa = amount_to_paisa(amount)

    fields = {
        "MERCHANTID": settings.CONNECTIPS_MERCHANT_ID,
        "APPID": settings.CONNECTIPS_APP_ID,
        "APPNAME": settings.CONNECTIPS_APP_NAME,
        "TXNID": txn_id,
        "TXNDATE": get_txn_date(),
        "TXNCRNCY": settings.CONNECTIPS_CURRENCY,
        "TXNAMT": str(amount_paisa),
        "REFERENCEID": reference_id,
        "REMARKS": remarks[:50],
        "PARTICULARS": particulars[:100],
    }

    message = build_payment_token_message(fields)
    fields["TOKEN"] = rsa_sign_base64(message)

    return fields


def get_login_url():
    return f"{settings.CONNECTIPS_BASE_URL.rstrip('/')}/connectipswebgw/loginpage"


def get_validate_url():
    return f"{settings.CONNECTIPS_BASE_URL}/connectipswebws/api/creditor/validatetxn"


def get_txn_detail_url():
    return f"{settings.CONNECTIPS_BASE_URL}/connectipswebws/api/creditor/gettxndetail"


def validate_connectips_transaction(reference_id, amount_paisa):
    """
    Server-side validation after connectIPS redirects user back with TXNID.
    Docs say validatetxn uses Basic Auth with APPID and password.
    """

    merchant_id = int(settings.CONNECTIPS_MERCHANT_ID)
    app_id = settings.CONNECTIPS_APP_ID

    token_message = build_validation_token_message(
        merchant_id=merchant_id,
        app_id=app_id,
        reference_id=reference_id,
        txn_amt=amount_paisa,
    )

    token = rsa_sign_base64(token_message)

    payload = {
        "merchantId": merchant_id,
        "appId": app_id,
        "referenceId": reference_id,
        "txnAmt": amount_paisa,
        "token": token,
    }

    response = requests.post(
        get_validate_url(),
        json=payload,
        auth=(settings.CONNECTIPS_APP_ID, settings.CONNECTIPS_APP_PASSWORD),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=60,
    )

    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}

    if response.status_code >= 400:
        raise RuntimeError(str(data))

    return payload, data


def get_connectips_transaction_detail(reference_id, amount_paisa):
    merchant_id = int(settings.CONNECTIPS_MERCHANT_ID)
    app_id = settings.CONNECTIPS_APP_ID

    token_message = build_validation_token_message(
        merchant_id=merchant_id,
        app_id=app_id,
        reference_id=reference_id,
        txn_amt=amount_paisa,
    )

    token = rsa_sign_base64(token_message)

    payload = {
        "merchantId": merchant_id,
        "appId": app_id,
        "referenceId": reference_id,
        "txnAmt": amount_paisa,
        "token": token,
    }

    response = requests.post(
        get_txn_detail_url(),
        json=payload,
        auth=(settings.CONNECTIPS_APP_ID, settings.CONNECTIPS_APP_PASSWORD),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=60,
    )

    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}

    if response.status_code >= 400:
        raise RuntimeError(str(data))

    return payload, data