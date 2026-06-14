from decimal import Decimal
from django.db.models import Sum

from legacy_hmis.models import (
    Tblencounter,
    Tblpatientinfo,
    Tblpatbilldetail,
    Tbltempbilldetail,
    Tblpatbilling,
    Tbladvreceiptdetail,
    Tblcashsources,
)


def money(value):
    value = Decimal(value or 0)
    return str(value.quantize(Decimal("0.01")))


def dt(value):
    if not value:
        return ""
    return value.strftime("%Y-%m-%d %H:%M:%S")


def get_patient_encounters(patient_id):
    encounters = (
        Tblencounter.objects
        .filter(fldpatientval=patient_id)
        .order_by("-fldregdate", "-fldencounterval")
    )

    return [
        {
            "encounter_id": e.fldencounterval,
            "date": dt(e.fldregdate),
            "visit_type": e.fldvisit or "",
            "billing_mode": e.fldbillingmode or "",
        }
        for e in encounters
    ]


def get_latest_encounter_id(patient_id):
    encounter = (
        Tblencounter.objects
        .filter(fldpatientval=patient_id)
        .order_by("-fldregdate", "-fldencounterval")
        .first()
    )

    if not encounter:
        raise ValueError("No encounter found for this patient")

    return encounter.fldencounterval


def patient_owns_encounter(patient_id, encounter_id):
    return Tblencounter.objects.filter(
        fldpatientval=patient_id,
        fldencounterval=encounter_id,
    ).exists()


def get_patient_summary_by_encounter(patient_id, encounter_id):
    encounter = Tblencounter.objects.filter(
        fldpatientval=patient_id,
        fldencounterval=encounter_id,
    ).first()

    if not encounter:
        raise PermissionError("You are not allowed to access this encounter")

    patient = Tblpatientinfo.objects.filter(
        fldpatientval=patient_id,
    ).first()

    full_name = ""
    if patient:
        full_name = f"{patient.fldptnamefir or ''} {patient.fldptnamelast or ''}".strip()

    return {
        "patient_id": patient_id,
        "patient_name": full_name,
        "patient_code": patient.fldptcode if patient else "",
        "contact": patient.fldptcontact if patient else "",
        "gender": patient.fldptsex if patient else "",
        "encounter_id": encounter_id,
        "reg_date": dt(encounter.fldregdate),
        "visit_type": encounter.fldvisit or "",
        "billing_mode": encounter.fldbillingmode or "",
        "discount_type": encounter.flddisctype or "",
    }


def serialize_bill_row(row, document_type):
    return {
        "document_type": document_type,
        "bill_no": row.fldbillno,
        "encounter_id": row.fldencounterval,
        "time": dt(row.fldtime),
        "bill_type": row.fldbilltype or "",
        "bank_name": row.fldbankname or "",
        "cheque_no": row.fldchequeno or "",
        "item_amount": money(row.flditemamt),
        "discount_amount": money(row.flddiscountamt),
        "tax_amount": money(row.fldtaxamt),
        "charged_amount": money(row.fldchargedamt),
        "received_amount": money((row.fldreceivedamt or 0) + (row.fldcurdeposit or 0)),
        "current_deposit": money(row.fldcurdeposit),
        "previous_deposit": money(row.fldprevdeposit),
        "user_id": row.flduserid or "",
        "component": row.fldcomp or "",
        "discount_group": row.flddiscountgroup or "",
    }


def get_invoice_rows(encounter_id):
    rows = (
        Tblpatbilldetail.objects
        .filter(fldencounterval__iexact=encounter_id)
        .order_by("fldid")
    )

    return [serialize_bill_row(row, "INVOICE") for row in rows if row.fldbillno]


def get_receipt_rows(encounter_id):
    rows = (
        Tbltempbilldetail.objects
        .filter(fldencounterval__iexact=encounter_id)
        .order_by("fldid")
    )

    return [serialize_bill_row(row, "RECEIPT") for row in rows if row.fldbillno]


def calculate_invoice_totals(encounter_id):
    data = Tblpatbilldetail.objects.filter(
        fldencounterval__iexact=encounter_id
    ).aggregate(
        total_amount=Sum("fldchargedamt"),
        tax_amount=Sum("fldtaxamt"),
        discount_amount=Sum("flddiscountamt"),
        received_amount=Sum("fldreceivedamt") + Sum("fldcurdeposit"),
    )

    return {
        "total_amount": money(data.get("total_amount")),
        "tax_amount": money(data.get("tax_amount")),
        "discount_amount": money(data.get("discount_amount")),
        "received_amount": money(data.get("received_amount")),
    }


def calculate_receipt_totals(encounter_id):
    data = Tbltempbilldetail.objects.filter(
        fldencounterval__iexact=encounter_id
    ).aggregate(
        total_amount=Sum("fldchargedamt"),
        tax_amount=Sum("fldtaxamt"),
        discount_amount=Sum("flddiscountamt"),
        received_amount=Sum("fldreceivedamt") + Sum("fldcurdeposit"),
    )

    return {
        "total_amount": money(data.get("total_amount")),
        "tax_amount": money(data.get("tax_amount")),
        "discount_amount": money(data.get("discount_amount")),
        "received_amount": money(data.get("received_amount")),
    }

def get_billing_documents(patient_id, encounter_id=None):
    if not encounter_id:
        encounter_id = get_latest_encounter_id(patient_id)

    if not patient_owns_encounter(patient_id, encounter_id):
        raise PermissionError("You are not allowed to access this encounter")

    return {
        "patient": get_patient_summary_by_encounter(patient_id, encounter_id),
        "encounter_id": encounter_id,
        "categories": {
            "Invoices": get_invoice_rows(encounter_id),
            "Receipts": get_receipt_rows(encounter_id),
        },
        "totals": {
            "Invoices": calculate_invoice_totals(encounter_id),
            "Receipts": calculate_receipt_totals(encounter_id),
        },
    }


def get_bill_master(document_type, bill_no):
    if document_type == "INVOICE":
        model = Tblpatbilldetail
    elif document_type == "RECEIPT":
        model = Tbltempbilldetail
    else:
        raise ValueError("Invalid document type")

    bill = model.objects.filter(fldbillno=bill_no).first()

    if not bill:
        raise ValueError("Bill/receipt not found")

    return bill


def get_itemized_details(bill_no):
    rows = (
        Tblpatbilling.objects
        .filter(fldbillno=bill_no)
        .order_by("flditemtype", "fldid")
    )

    return [
        {
            "time": dt(row.fldtime),
            "item_no": row.flditemno or "",
            "item_name": row.flditemname or "",
            "item_rate": money(row.flditemrate),
            "item_qty": money(row.flditemqty),
            "tax_percent": money(row.fldtaxper),
            "discount_percent": money(row.flddiscper),
            "discount_amount": money(row.flddiscamt),
            "amount": money(row.fldditemamt),
            "item_type": row.flditemtype or "",
            "pay_to": row.fldpayto or "",
            "refer": row.fldrefer or "",
            "cash_credit": row.fldcashincredit or "",
        }
        for row in rows
    ]


def get_advance_verification(bill_no):
    rows = Tbladvreceiptdetail.objects.filter(fldinvoice=bill_no)

    total = rows.aggregate(total=Sum("fldreceivedamt")).get("total")

    first = rows.first()

    return {
        "verified": first.fldverify if first else "",
        "received_total": money(total),
    }


def get_cash_sources(bill_no):
    rows = (
        Tblcashsources.objects
        .filter(fldbillno=bill_no)
        .exclude(fldvendor="Cash in Hand")
    )

    total = rows.aggregate(total=Sum("fldcashamt")).get("total")

    return {
        "total": money(total),
        "sources": [
            {
                "vendor": row.fldvendor or "",
                "amount": money(row.fldcashamt),
            }
            for row in rows
        ],
    }


def get_document_preview(patient_id, document_type, bill_no):
    bill = get_bill_master(document_type, bill_no)

    if not patient_owns_encounter(patient_id, bill.fldencounterval):
        raise PermissionError("You are not allowed to access this document")

    patient = get_patient_summary_by_encounter(
        patient_id=patient_id,
        encounter_id=bill.fldencounterval,
    )

    return {
        "document_type": document_type,
        "bill": serialize_bill_row(bill, document_type),
        "patient": patient,
        "items": get_itemized_details(bill_no),
        "advance_verification": get_advance_verification(bill_no),
        "cash_sources": get_cash_sources(bill_no),
    }