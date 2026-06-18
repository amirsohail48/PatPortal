import json
import logging
from decimal import Decimal

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import csrf_protect

logger = logging.getLogger(__name__)

from patients.services.encounter_service import get_latest_encounter_id
from billing.services.invoice_service import (
    get_pending_invoice_groups,
    get_arc_amount,
)
from billing.services.healthybit_service import (
    check_invoice,
    create_invoice,
    create_deposit,
)

from billing.services.billing_document_services import (
    get_patient_encounters,
    get_billing_documents,
    get_document_preview,
)

#=========================Invoice and Receipt Preview===============================
@require_GET
def billing_encounters_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounters": get_patient_encounters(patient_id),
        })

    except Exception:
        logger.exception("billing_encounters_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@require_GET
def invoices_receipts_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username
        encounter_id = request.GET.get("encounter_id")

        data = get_billing_documents(
            patient_id=patient_id,
            encounter_id=encounter_id,
        )
        
        return JsonResponse({
            "success": True,
            **data,
        })

    except PermissionError as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=403)

    except Exception:
        logger.exception("invoices_receipts_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def billing_document_preview_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))

        document_type = payload.get("document_type")
        bill_no = payload.get("bill_no")

        if document_type not in ["INVOICE", "RECEIPT"]:
            return JsonResponse({
                "success": False,
                "error": "Invalid document_type",
            }, status=400)

        if not bill_no:
            return JsonResponse({
                "success": False,
                "error": "bill_no is required",
            }, status=400)

        data = get_document_preview(
            patient_id=request.user.username,
            document_type=document_type,
            bill_no=bill_no,
        )

        return JsonResponse({
            "success": True,
            **data,
        })

    except PermissionError as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=403)

    except Exception:
        logger.exception("billing_document_preview_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)

#=======================Billpayment Related======================================
@require_GET
def pending_bills_api(request):
    """
    Returns pending bill groups for logged-in patient.

    Flow:
    logged-in patient_id
    → latest encounter
    → pending tblpatbilling rows
    → grouped by fldextracol
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username
        encounter_id = get_latest_encounter_id(patient_id)
        invoice_groups = get_pending_invoice_groups(encounter_id)

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "invoice_groups": invoice_groups,
        })

    except Exception:
        logger.exception("pending_bills_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def arc_amount_api(request):
    """
    Returns the recalculated amount for one ARC group.

    Important:
    Frontend amount should not be trusted.
    Backend recalculates amount from tblpatbilling.
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
        arc_code = payload.get("arc_code")

        if not arc_code:
            return JsonResponse({
                "success": False,
                "error": "arc_code is required",
            }, status=400)

        patient_id = request.user.username
        encounter_id = get_latest_encounter_id(patient_id)
        amount = get_arc_amount(encounter_id, arc_code)

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "arc_code": arc_code,
            "amount": str(amount),
        })

    except Exception:
        logger.exception("arc_amount_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def create_invoice_api(request):
    """
    Optional/internal API.

    This should only be called after payment success.
    In normal flow, payments app should call healthybit service directly after gateway success.
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))

        arc_code = payload.get("arc_code")

        if not arc_code:
            return JsonResponse({
                "success": False,
                "error": "arc_code is required",
            }, status=400)

        patient_id = request.user.username
        encounter_id = get_latest_encounter_id(patient_id)

        # Recalculate amount from database
        amount = get_arc_amount(encounter_id, arc_code)

        # Optional check before creation
        check_invoice(encounter_id, arc_code)

        invoice_no = create_invoice(
            encounter_id=encounter_id,
            arc_code=arc_code,
            amount=amount,
        )

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "arc_code": arc_code,
            "amount": str(amount),
            "invoice_no": invoice_no,
        })

    except Exception:
        logger.exception("create_invoice_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def create_deposit_api(request):
    """
    Optional/internal API.

    This should only be called after payment success.
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))

        transaction_no = payload.get("transaction_no")
        amount = Decimal(str(payload.get("amount", "0")))

        if not transaction_no:
            return JsonResponse({
                "success": False,
                "error": "transaction_no is required",
            }, status=400)

        if amount <= 0:
            return JsonResponse({
                "success": False,
                "error": "Amount must be greater than zero",
            }, status=400)

        patient_id = request.user.username
        encounter_id = get_latest_encounter_id(patient_id)

        deposit_no = create_deposit(
            encounter_id=encounter_id,
            transaction_no=transaction_no,
            amount=amount,
        )

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "amount": str(amount),
            "deposit_no": deposit_no,
        })

    except Exception:
        logger.exception("create_deposit_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)