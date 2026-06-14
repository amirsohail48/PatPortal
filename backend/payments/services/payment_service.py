from patients.services.encounter_service import get_latest_encounter_id
from billing.services.invoice_service import get_arc_amount
from billing.services.healthybit_service import (
    check_invoice,
    create_invoice,
    create_deposit,
)


def prepare_bill_payment(patient_id, arc_code):
    encounter_id = get_latest_encounter_id(patient_id)
    amount = get_arc_amount(encounter_id, arc_code)

    return {
        "patient_id": patient_id,
        "encounter_id": encounter_id,
        "arc_code": arc_code,
        "amount": amount,
    }


def finalize_bill_payment(payment):
    if payment.healthybit_invoice_no:
        return payment.healthybit_invoice_no

    check_invoice(payment.encounter_id, payment.arc_code)

    invoice_no = create_invoice(
        encounter_id=payment.encounter_id,
        arc_code=payment.arc_code,
        amount=payment.amount,
    )

    payment.healthybit_invoice_no = invoice_no
    payment.status = "INVOICE_CREATED"
    payment.save(update_fields=["healthybit_invoice_no", "status", "updated_at"])

    return invoice_no


def finalize_deposit_payment(payment):
    if payment.healthybit_deposit_no:
        return payment.healthybit_deposit_no

    deposit_no = create_deposit(
        encounter_id=payment.encounter_id,
        transaction_no=payment.transaction_uuid,
        amount=payment.amount,
    )

    payment.healthybit_deposit_no = deposit_no
    payment.status = "DEPOSIT_CREATED"
    payment.save(update_fields=["healthybit_deposit_no", "status", "updated_at"])

    return deposit_no