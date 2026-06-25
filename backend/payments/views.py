import json
import logging
import uuid
from decimal import Decimal
from django.utils import timezone

from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_POST

logger = logging.getLogger(__name__)

from payments.models import EsewaPaymentTransaction, ConnectIPSPaymentTransaction, KhaltiPaymentTransaction
from payments.exceptions import GatewayError
from payments.gateways.esewa import (
    book_intent_payment,
    check_intent_status,
    verify_esewa_signature,
    verify_epay_response_signature,
    build_epay_v2_form_fields,
)

from payments.gateways.connectips import (
    amount_to_paisa,
    generate_txn_id,
    build_connectips_payment_fields,
    get_login_url,
    validate_connectips_transaction,
    get_connectips_transaction_detail,
)

from payments.gateways.khalti import (
    amount_to_paisa as khalti_amount_to_paisa,
    generate_order_id as khalti_generate_order_id,
    khalti_initiate,
    khalti_lookup,
)

from patients.services.encounter_service import get_latest_encounter_id
from billing.services.invoice_service import get_arc_amount
from billing.services.healthybit_service import (
    check_invoice,
    create_invoice,
    create_deposit,
)
from appointments.services.quota_services import validate_appointment_before_payment
from appointments.services.booking_service import (
    generate_booking_id,
    create_booking_after_success,
)


@csrf_protect
@require_POST
def esewa_initiate_bill_payment_api(request):
    """
    Starts eSewa payment for one ARC bill group.

    Frontend sends:
    {
        "arc_code": "ARC82/83-55567test"
    }

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

        # Never trust frontend amount
        amount = get_arc_amount(encounter_id, arc_code)

        transaction_uuid = f"BILL-{patient_id}-{uuid.uuid4().hex[:12]}"

        with transaction.atomic():
            payment = EsewaPaymentTransaction.objects.create(
                patient_id=patient_id,
                encounter_id=encounter_id,
                payment_type="BILL",
                arc_code=arc_code,
                amount=amount,
                transaction_uuid=transaction_uuid,
                esewa_status="INITIATED",
            )

            # Mobile Intent booking
            request_payload, esewa_response = book_intent_payment(
                amount=amount,
                transaction_uuid=transaction_uuid,
                customer_id=patient_id,
                remarks=f"Bill payment for {arc_code}",
            )

            # Desktop/mobile browser ePay RC web form
            epay_form = build_epay_v2_form_fields(
                amount=amount,
                transaction_uuid=transaction_uuid,
            )

            response_data = esewa_response.get("data", {})

            payment.booking_id = response_data.get("booking_id")
            payment.correlation_id = response_data.get("correlation_id")
            payment.deeplink = response_data.get("deeplink")
            payment.raw_request = {
                "intent_request": request_payload,
                "epay_form": epay_form,
            }
            payment.raw_response = esewa_response
            payment.esewa_status = "BOOKED"
            payment.save()

        return JsonResponse({
            "success": True,
            "payment_id": payment.id,
            "payment_type": payment.payment_type,
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "arc_code": arc_code,
            "amount": str(amount),
            "transaction_uuid": transaction_uuid,

            # Intent/mobile app data
            "booking_id": payment.booking_id,
            "correlation_id": payment.correlation_id,
            "deeplink": payment.deeplink,

            # ePay RC web data
            "web_payment_action": epay_form["action_url"],
            "web_payment_fields": epay_form["fields"],
        })

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("esewa_initiate_bill_payment_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def esewa_initiate_deposit_payment_api(request):
    """
    Starts eSewa payment for patient deposit.

    Frontend sends:
    {
        "amount": "5000"
    }
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))

        amount = Decimal(str(payload.get("amount", "0")))

        if amount <= 0:
            return JsonResponse({
                "success": False,
                "error": "Deposit amount must be greater than zero",
            }, status=400)

        patient_id = request.user.username
        encounter_id = get_latest_encounter_id(patient_id)

        transaction_uuid = f"DEP-{encounter_id}-{uuid.uuid4().hex[:12]}"

        with transaction.atomic():
            payment = EsewaPaymentTransaction.objects.create(
                patient_id=patient_id,
                encounter_id=encounter_id,
                payment_type="DEPOSIT",
                amount=amount,
                transaction_uuid=transaction_uuid,
                esewa_status="INITIATED",
            )

            request_payload, esewa_response = book_intent_payment(
                amount=amount,
                transaction_uuid=transaction_uuid,
                customer_id=patient_id,
                remarks="Patient online deposit",
            )
            from payments.gateways.esewa import build_epay_v2_form_fields
            epay_form = build_epay_v2_form_fields(
                amount=amount,
                transaction_uuid=transaction_uuid,
            )

            response_data = esewa_response.get("data", {})

            payment.booking_id = response_data.get("booking_id")
            payment.correlation_id = response_data.get("correlation_id")
            payment.deeplink = response_data.get("deeplink")
            payment.raw_request = request_payload
            payment.raw_response = esewa_response
            payment.esewa_status = "BOOKED"
            payment.save()

        return JsonResponse({
            "success": True,
            "payment_id": payment.id,
            "payment_type": payment.payment_type,
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "amount": str(amount),
            "transaction_uuid": transaction_uuid,
            "booking_id": payment.booking_id,
            "correlation_id": payment.correlation_id,
            "deeplink": payment.deeplink,
            "web_payment_action": epay_form["action_url"],
            "web_payment_fields": epay_form["fields"],
        })

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("esewa_initiate_deposit_payment_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)

@csrf_protect
@require_POST
def esewa_initiate_appointment_payment_api(request):
    """
    Initiates eSewa payment for appointment.

    Final rule:
    - Check quota before payment.
    - Store appointment payload in payment transaction.
    - Store booking_id in encounter_id for APPOINTMENT.
    - Do not create tblonlinebook yet.
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    try:
        patient_id = request.user.username
        appointment = payload.get("appointment") or {}

        normalized_appointment = validate_appointment_before_payment(appointment, patient_id=patient_id)

        booking_id = generate_booking_id()
        normalized_appointment["booking_id"] = booking_id

        amount = Decimal(str(normalized_appointment["item_cost"]))

        transaction_uuid = f"APT-{patient_id}-{uuid.uuid4().hex[:12]}"

        with transaction.atomic():
            payment = EsewaPaymentTransaction.objects.create(
                patient_id=patient_id,
                encounter_id=booking_id,
                payment_type="APPOINTMENT",
                amount=amount,
                transaction_uuid=transaction_uuid,
                esewa_status="INITIATED",
                raw_request={
                    "appointment": normalized_appointment,
                    "payload": payload,
                },
            )

            request_payload, esewa_response = book_intent_payment(
                amount=amount,
                transaction_uuid=transaction_uuid,
                customer_id=patient_id,
                remarks="Patient Online Appointment",
            )

            epay_form = build_epay_v2_form_fields(
                amount=amount,
                transaction_uuid=transaction_uuid,
            )

            response_data = esewa_response.get("data", {})

            payment.booking_id = response_data.get("booking_id")
            payment.correlation_id = response_data.get("correlation_id")
            payment.deeplink = response_data.get("deeplink")
            payment.esewa_status = "BOOKED"
            payment.raw_response = {
                "intent_response": esewa_response,
                "intent_request": request_payload,
                "epay_form": epay_form,
            }
            payment.save()

        return JsonResponse({
            "success": True,
            "gateway": "ESEWA",
            "payment_id": payment.pk,
            "payment_type": payment.payment_type,
            "appointment_booking_id": booking_id,
            "transaction_uuid": payment.transaction_uuid,
            "amount": str(payment.amount),
            "booking_id": payment.booking_id,
            "correlation_id": payment.correlation_id,
            "deeplink": payment.deeplink,
            "web_payment_action": epay_form["action_url"],
            "web_payment_fields": epay_form["fields"],
            "appointment": normalized_appointment,
        })

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("esewa_initiate_appointment_payment_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)

@csrf_exempt
@require_POST
def esewa_callback_api(request):
    """
    eSewa server-to-server callback.

    CSRF must be exempt because this request comes from eSewa server,
    not from your browser.
    """

    try:
        payload = json.loads(request.body.decode("utf-8"))

        if not verify_esewa_signature(payload):
            return JsonResponse({
                "success": False,
                "error": "Invalid eSewa signature",
            }, status=400)

        correlation_id = payload.get("correlation_id")
        status = payload.get("status")
        reference_code = payload.get("reference_code")

        payment = EsewaPaymentTransaction.objects.get(
            correlation_id=correlation_id
        )

        payment.callback_payload = payload
        payment.reference_code = reference_code
        payment.esewa_status = status
        payment.save()

        if status == "SUCCESS":
            finalize_successful_payment(payment)

        return JsonResponse({
            "success": True,
            "message": "Callback processed",
        })

    except EsewaPaymentTransaction.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Payment transaction not found",
        }, status=404)

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("esewa_callback_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def esewa_status_api(request):
    """
    Manually checks eSewa payment status.

    Use this when:
    - user comes back from eSewa
    - callback was delayed
    - mobile app did not receive final response
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
        payment_id = payload.get("payment_id")

        if not payment_id:
            return JsonResponse({
                "success": False,
                "error": "payment_id is required",
            }, status=400)

        payment = EsewaPaymentTransaction.objects.get(
            id=payment_id,
            patient_id=request.user.username,
        )

        request_payload, status_response = check_intent_status(
            booking_id=payment.booking_id,
            correlation_id=payment.correlation_id,
        )

        response_data = status_response.get("data", {})
        status = response_data.get("status") # type: ignore

        payment.raw_response = status_response # type: ignore
        payment.esewa_status = status or payment.esewa_status
        payment.reference_code = response_data.get("reference_code") or payment.reference_code # type: ignore
        payment.save()

        final_result = None

        if status == "SUCCESS":
            final_result = finalize_successful_payment(payment)

        return JsonResponse({
            "success": True,
            "payment_id": payment.id, # type: ignore
            "payment_type": payment.payment_type,
            "status": payment.esewa_status,
            "reference_code": payment.reference_code,
            "invoice_no": payment.healthybit_invoice_no,
            "deposit_no": payment.healthybit_deposit_no,
            "booking_confirmation": final_result if payment.payment_type == "APPOINTMENT" else None,
        })

    except EsewaPaymentTransaction.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Payment transaction not found",
        }, status=404)

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("esewa_status_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


def _assert_valid_deposit_no(result, context=""):
    """
    Raises GatewayError if Healthybit did not return a valid DET deposit number.

    Valid: any string containing "DET" (e.g. "DEPOSIT:DET-2SDH1").
    Invalid: "Duplicate Request", empty, or any other non-DET response.
    """
    if not result or "DET" not in str(result).upper():
        logger.error("Healthybit deposit invalid response=%r context=%s", result, context)
        raise GatewayError(
            f"Deposit could not be recorded in the hospital system ({result}). "
            "Please contact the billing desk with your payment receipt."
        )


def finalize_successful_payment(payment):
    """
    Creates Healthybit invoice, deposit, or appointment booking after verified payment success.

    For APPOINTMENT:
    - No quota re-check.
    - Insert tblonlinebook.
    - Calculate queue.
    """

    if payment.payment_type == "BILL":
        if payment.healthybit_invoice_no:
            return payment.healthybit_invoice_no

        check_invoice(
            encounter_id=payment.encounter_id,
            arc_code=payment.arc_code,
        )

        invoice_no = create_invoice(
            encounter_id=payment.encounter_id,
            arc_code=payment.arc_code,
            amount=payment.amount,
        )

        payment.healthybit_invoice_no = invoice_no
        payment.esewa_status = "INVOICE_CREATED"
        payment.save(update_fields=[
            "healthybit_invoice_no",
            "esewa_status",
            "updated_at",
        ])

        return invoice_no

    if payment.payment_type == "DEPOSIT":
        if payment.healthybit_deposit_no:
            return payment.healthybit_deposit_no

        raw_deposit = create_deposit(
            encounter_id=payment.encounter_id,
            transaction_no=payment.transaction_uuid,
            amount=payment.amount,
        )

        _assert_valid_deposit_no(raw_deposit, context=f"esewa txn={payment.transaction_uuid}")
        deposit_no = raw_deposit

        payment.healthybit_deposit_no = deposit_no
        payment.esewa_status = "DEPOSIT_CREATED"
        payment.save(update_fields=[
            "healthybit_deposit_no",
            "esewa_status",
            "updated_at",
        ])

        return deposit_no

    if payment.payment_type == "APPOINTMENT":
        existing_response = payment.raw_response or {}

        if isinstance(existing_response, dict):
            existing_confirmation = existing_response.get("appointment_confirmation")
            if existing_confirmation:
                return existing_confirmation

        confirmation = create_booking_after_success(
            payment=payment,
            gateway="ESEWA",
        )

        if not isinstance(existing_response, dict):
            existing_response = {}

        existing_response["appointment_confirmation"] = confirmation

        payment.raw_response = existing_response
        payment.esewa_status = "SUCCESS"
        payment.save(update_fields=[
            "raw_response",
            "esewa_status",
            "updated_at",
        ])

        return confirmation

    raise ValueError("Invalid payment type")


@csrf_protect
@require_POST
def connectips_initiate_api(request):
    """
    Generic connectIPS payment initiation.

    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    try:

        normalized_appointment = None
        encounter_id = None
        arc_code = None

        payment_type = payload.get("payment_type", "GENERAL")
        remarks = payload.get("remarks", "PatPortal Payment")
        particulars = payload.get("particulars", "PatPortal Online Payment")

        patient_id = request.user.username

        if payment_type == "BILL":
            arc_code = payload.get("arc_code")
            if not arc_code:
                return JsonResponse({
                    "success": False,
                    "error": "arc_code is required for BILL payment",
                }, status=400)
            encounter_id = get_latest_encounter_id(patient_id)
            amount = get_arc_amount(encounter_id, arc_code)

        elif payment_type == "DEPOSIT":
            encounter_id = get_latest_encounter_id(patient_id)
            amount = Decimal(str(payload.get("amount", "0")))

        elif payment_type == "APPOINTMENT":
            appointment = payload.get("appointment") or {}
            normalized_appointment = validate_appointment_before_payment(appointment, patient_id=patient_id)
            booking_id = generate_booking_id()
            normalized_appointment["booking_id"] = booking_id
            amount = Decimal(str(normalized_appointment["item_cost"]))

        else:
            amount = Decimal(str(payload.get("amount", "0")))

        if amount <= 0:
            return JsonResponse({
                "success": False,
                "error": "Amount must be greater than zero",
            }, status=400)

        txn_id = generate_txn_id()
        reference_id = txn_id
        amount_paisa = amount_to_paisa(amount)

        fields = build_connectips_payment_fields(
            txn_id=txn_id,
            amount=amount,
            reference_id=reference_id,
            remarks=remarks,
            particulars=particulars,
        )

        payment = ConnectIPSPaymentTransaction.objects.create(
            payment_type=payment_type,
            patient_id=patient_id,
            encounter_id=encounter_id,
            arc_code=arc_code,
            txn_id=txn_id,
            reference_id=reference_id,
            amount=amount,
            amount_paisa=amount_paisa,
            remarks=remarks,
            particulars=particulars,
            request_payload={
                "connectips_fields": fields,
                "appointment": normalized_appointment,
                "original_payload": payload,
            },
            status="INITIATED",
        )

        return JsonResponse({
            "success": True,
            "gateway": "CONNECTIPS",
            "payment_id": payment.id,
            "txn_id": txn_id,
            "reference_id": reference_id,
            "amount": str(amount),
            "amount_paisa": amount_paisa,
            "action_url": get_login_url(),
            "method": "POST",
            "fields": fields,
            "form_fields": fields,
        })

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("connectips_initiate_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def connectips_validate_api(request):
    """
    Called after user returns from connectIPS success/failure page.

    Frontend sends:
    {
      "txn_id": "CIPSxxxx"
    }
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    txn_id = payload.get("txn_id") or payload.get("TXNID")

    if not txn_id:
        return JsonResponse({
            "success": False,
            "error": "TXNID is required",
        }, status=400)

    try:
        payment = ConnectIPSPaymentTransaction.objects.get(
            txn_id=txn_id,
            patient_id=request.user.username,
        )

        validation_request, validation_response = validate_connectips_transaction(
            reference_id=payment.reference_id,
            amount_paisa=payment.amount_paisa,
        )

        status = validation_response.get("status", "")
        status_desc = validation_response.get("statusDesc", "")

        payment.validation_request = validation_request
        payment.validation_response = validation_response
        payment.connectips_status = status
        payment.status_desc = status_desc

        appointment_confirmation = None
        invoice_no = None
        deposit_no = None

        if status == "SUCCESS":
            payment.status = "SUCCESS"

            if not payment.is_finalized:
                if payment.payment_type == "APPOINTMENT":
                    appointment_confirmation = create_booking_after_success(
                        payment=payment,
                        gateway="CONNECTIPS",
                    )

                elif payment.payment_type == "BILL":
                    check_invoice(
                        encounter_id=payment.encounter_id,
                        arc_code=payment.arc_code,
                    )
                    invoice_no = create_invoice(
                        encounter_id=payment.encounter_id,
                        arc_code=payment.arc_code,
                        amount=payment.amount,
                    )

                elif payment.payment_type == "DEPOSIT":
                    raw_deposit = create_deposit(
                        encounter_id=payment.encounter_id,
                        transaction_no=payment.txn_id,
                        amount=payment.amount,
                    )
                    _assert_valid_deposit_no(raw_deposit, context=f"connectips txn={payment.txn_id}")
                    deposit_no = raw_deposit

            payment.is_finalized = True
        elif status == "FAILED":
            payment.status = "FAILED"
        elif status == "ERROR":
            payment.status = "ERROR"
        else:
            payment.status = "INCOMPLETE"

        payment.save()

        detail_response = None

        if status == "SUCCESS":
            try:
                detail_request, detail_response = get_connectips_transaction_detail(
                    reference_id=payment.reference_id,
                    amount_paisa=payment.amount_paisa,
                )

                payment.detail_response = detail_response
                payment.nchl_txn_id = str(detail_response.get("txnId", "") or "")
                payment.batch_id = str(detail_response.get("batchId", "") or "")
                payment.save()

            except Exception:
                logger.exception("connectIPS detail fetch error txn_id=%s", txn_id)

        return JsonResponse({
            "success": True,
            "payment_id": payment.id,
            "txn_id": payment.txn_id,
            "reference_id": payment.reference_id,
            "amount": str(payment.amount),
            "amount_paisa": payment.amount_paisa,
            "connectips_status": payment.connectips_status,
            "status_desc": payment.status_desc,
            "is_paid": payment.status == "SUCCESS",
            "validation_response": validation_response,
            "detail_response": detail_response,
            "booking_confirmation": appointment_confirmation,
            "invoice_no": invoice_no,
            "deposit_no": deposit_no,
        })

    except ConnectIPSPaymentTransaction.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Payment transaction not found",
        }, status=404)

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("connectips_validate_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def esewa_epay_verify_api(request):
    """
    Verifies eSewa ePay V2 redirect response.

    Frontend sends:
    {
        "esewa_data": {
            "transaction_uuid": "...",
            "status": "COMPLETE",
            "total_amount": "...",
            "transaction_code": "...",
            "product_code": "EPAYTEST",
            ...
        }
    }
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
        esewa_data = payload.get("esewa_data") or {}

        transaction_uuid = esewa_data.get("transaction_uuid")
        status = esewa_data.get("status")
        total_amount = esewa_data.get("total_amount")
        transaction_code = esewa_data.get("transaction_code")

        if not transaction_uuid:
            return JsonResponse({
                "success": False,
                "error": "transaction_uuid is required",
            }, status=400)

        if not verify_epay_response_signature(esewa_data):
            logger.warning(
                "eSewa ePay signature verification failed transaction_uuid=%s",
                transaction_uuid,
            )
            return JsonResponse({
                "success": False,
                "error": "Invalid payment signature",
            }, status=400)

        payment = EsewaPaymentTransaction.objects.get(
            transaction_uuid=transaction_uuid,
            patient_id=request.user.username,
        )

        if Decimal(str(payment.amount)) != Decimal(str(total_amount)):
            logger.warning(
                "eSewa ePay amount mismatch expected=%s received=%s transaction_uuid=%s",
                payment.amount, total_amount, transaction_uuid,
            )
            return JsonResponse({
                "success": False,
                "error": "Payment amount mismatch",
            }, status=400)

        payment.callback_payload = esewa_data
        payment.reference_code = transaction_code or payment.reference_code
        payment.esewa_status = status or payment.esewa_status
        payment.save()

        final_result = None

        if status == "COMPLETE":
            final_result = finalize_successful_payment(payment)

        return JsonResponse({
            "success": True,
            "payment_id": payment.pk,
            "payment_type": payment.payment_type,
            "status": payment.esewa_status,
            "reference_code": payment.reference_code,
            "invoice_no": payment.healthybit_invoice_no,
            "deposit_no": payment.healthybit_deposit_no,
            "booking_confirmation": final_result if payment.payment_type == "APPOINTMENT" else None,
        })

    except EsewaPaymentTransaction.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Payment transaction not found",
        }, status=404)

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("esewa_epay_verify_api failed")
        return JsonResponse({
            "success": False,
            "error": "An unexpected error occurred. Please try again.",
        }, status=400)


@csrf_protect
@require_POST
def khalti_initiate_api(request):
    """
    Generic Khalti ePay payment initiation.

    Frontend sends:
    - BILL:        { "payment_type": "BILL", "arc_code": "..." }
    - DEPOSIT:     { "payment_type": "DEPOSIT", "amount": 5000 }
    - APPOINTMENT: { "payment_type": "APPOINTMENT", "appointment": {...} }
    """

    if not request.user.is_authenticated:
        return JsonResponse({"success": False, "error": "Authentication required"}, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    try:
        from django.conf import settings as django_settings

        patient_id = request.user.username
        payment_type = payload.get("payment_type", "GENERAL")

        normalized_appointment = None
        encounter_id = None
        arc_code = None

        if payment_type == "BILL":
            arc_code = payload.get("arc_code")
            if not arc_code:
                return JsonResponse({"success": False, "error": "arc_code is required for BILL payment"}, status=400)
            encounter_id = get_latest_encounter_id(patient_id)
            amount = get_arc_amount(encounter_id, arc_code)

        elif payment_type == "DEPOSIT":
            encounter_id = get_latest_encounter_id(patient_id)
            amount = Decimal(str(payload.get("amount", "0")))

        elif payment_type == "APPOINTMENT":
            appointment = payload.get("appointment") or {}
            normalized_appointment = validate_appointment_before_payment(appointment, patient_id=patient_id)
            booking_id = generate_booking_id()
            normalized_appointment["booking_id"] = booking_id
            encounter_id = booking_id
            amount = Decimal(str(normalized_appointment["item_cost"]))

        else:
            amount = Decimal(str(payload.get("amount", "0")))

        if amount <= 0:
            return JsonResponse({"success": False, "error": "Amount must be greater than zero"}, status=400)

        purchase_order_id = khalti_generate_order_id()
        amount_paisa = khalti_amount_to_paisa(amount)

        return_url = django_settings.KHALTI_RETURN_URL

        if payment_type == "BILL":
            order_name = f"Bill payment {arc_code}"
        elif payment_type == "DEPOSIT":
            order_name = "Patient deposit"
        elif payment_type == "APPOINTMENT":
            dept = (normalized_appointment or {}).get("department", "")
            order_name = f"Appointment {dept}".strip()
        else:
            order_name = "PatPortal Payment"

        pidx, payment_url, initiate_response = khalti_initiate(
            purchase_order_id=purchase_order_id,
            purchase_order_name=order_name,
            amount_paisa=amount_paisa,
            return_url=return_url,
        )

        payment = KhaltiPaymentTransaction.objects.create(
            payment_type=payment_type,
            patient_id=patient_id,
            encounter_id=encounter_id,
            arc_code=arc_code,
            purchase_order_id=purchase_order_id,
            pidx=pidx,
            amount=amount,
            amount_paisa=amount_paisa,
            status="INITIATED",
            request_payload={
                "appointment": normalized_appointment,
                "original_payload": payload,
            },
            initiate_response=initiate_response,
        )

        return JsonResponse({
            "success": True,
            "gateway": "KHALTI",
            "payment_id": payment.id,
            "payment_type": payment_type,
            "purchase_order_id": purchase_order_id,
            "pidx": pidx,
            "payment_url": payment_url,
            "amount": str(amount),
            "amount_paisa": amount_paisa,
        })

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("khalti_initiate_api failed")
        return JsonResponse({"success": False, "error": "An unexpected error occurred. Please try again."}, status=400)


@csrf_protect
@require_POST
def khalti_verify_api(request):
    """
    Verifies a Khalti ePay payment after user returns from Khalti gateway.

    Frontend sends:
    {
        "pidx": "..."
    }
    """

    if not request.user.is_authenticated:
        return JsonResponse({"success": False, "error": "Authentication required"}, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    pidx = payload.get("pidx")

    if not pidx:
        return JsonResponse({"success": False, "error": "pidx is required"}, status=400)

    try:
        with transaction.atomic():
            payment = KhaltiPaymentTransaction.objects.select_for_update().get(
                pidx=pidx,
                patient_id=request.user.username,
            )

            # Already finalized — return stored result without hitting Khalti again
            if payment.is_finalized and payment.status == "SUCCESS":
                stored = payment.lookup_response or {}
                return JsonResponse({
                    "success": True,
                    "payment_id": payment.id,
                    "payment_type": payment.payment_type,
                    "purchase_order_id": payment.purchase_order_id,
                    "pidx": payment.pidx,
                    "amount": str(payment.amount),
                    "khalti_status": payment.khalti_status,
                    "transaction_id": payment.transaction_id or "",
                    "is_paid": True,
                    "lookup_response": stored,
                    "booking_confirmation": stored.get("_appointment_confirmation"),
                    "invoice_no": stored.get("_invoice_no"),
                    "deposit_no": stored.get("_deposit_no"),
                })

            lookup_response = khalti_lookup(pidx)

            khalti_status = lookup_response.get("status", "")
            transaction_id = lookup_response.get("transaction_id") or lookup_response.get("txn_id") or ""

            payment.khalti_status = khalti_status
            payment.transaction_id = transaction_id

            appointment_confirmation = None
            invoice_no = None
            deposit_no = None

            if khalti_status == "Completed":
                payment.status = "SUCCESS"

                if not payment.is_finalized:
                    if payment.payment_type == "APPOINTMENT":
                        appointment_confirmation = create_booking_after_success(
                            payment=payment,
                            gateway="KHALTI",
                        )

                    elif payment.payment_type == "BILL":
                        check_invoice(
                            encounter_id=payment.encounter_id,
                            arc_code=payment.arc_code,
                        )
                        invoice_no = create_invoice(
                            encounter_id=payment.encounter_id,
                            arc_code=payment.arc_code,
                            amount=payment.amount,
                        )

                    elif payment.payment_type == "DEPOSIT":
                        raw_deposit = create_deposit(
                            encounter_id=payment.encounter_id,
                            transaction_no=payment.purchase_order_id,
                            amount=payment.amount,
                        )
                        _assert_valid_deposit_no(raw_deposit, context=f"khalti order={payment.purchase_order_id}")
                        deposit_no = raw_deposit

                    payment.is_finalized = True

            elif khalti_status in ("User canceled", "Expired"):
                payment.status = "FAILED"
            elif khalti_status == "Pending":
                payment.status = "PENDING"
            else:
                payment.status = "FAILED"

            # Store finalization results inside lookup_response for idempotent replay
            payment.lookup_response = {
                **lookup_response,
                "_deposit_no": deposit_no,
                "_invoice_no": invoice_no,
                "_appointment_confirmation": appointment_confirmation,
            }

            payment.save()

        return JsonResponse({
            "success": True,
            "payment_id": payment.id,
            "payment_type": payment.payment_type,
            "purchase_order_id": payment.purchase_order_id,
            "pidx": payment.pidx,
            "amount": str(payment.amount),
            "khalti_status": payment.khalti_status,
            "transaction_id": payment.transaction_id,
            "is_paid": payment.status == "SUCCESS",
            "lookup_response": lookup_response,
            "booking_confirmation": appointment_confirmation,
            "invoice_no": invoice_no,
            "deposit_no": deposit_no,
        })

    except KhaltiPaymentTransaction.DoesNotExist:
        return JsonResponse({"success": False, "error": "Payment transaction not found"}, status=404)

    except GatewayError as error:
        return JsonResponse({"success": False, "error": str(error)}, status=503)
    except Exception:
        logger.exception("khalti_verify_api failed")
        return JsonResponse({"success": False, "error": "An unexpected error occurred. Please try again."}, status=400)

