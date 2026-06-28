import logging
import uuid
from datetime import datetime ,date, time
from decimal import Decimal

logger = logging.getLogger(__name__)

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.db.models.functions import Trim
from django.db import connections

from legacy_hmis.models import (
    Tblonlinebook,
    Tblpatientinfo,
    Tblwebqueue,
)
from appointments.models import OnlineBooking

LEGACY_DB = "legacy_hmis"


def generate_booking_id():
    return f"WEB-{timezone.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"


def safe_datetime(value):
    """
    Always return timezone-aware datetime or None.
    Prevents: 'str' object has no attribute 'utcoffset'
    """

    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        if timezone.is_naive(value):
            return timezone.make_aware(value)
        return value

    if isinstance(value, date):
        dt = datetime.combine(value, time.min)
        return timezone.make_aware(dt)

    if isinstance(value, str):
        parsed_dt = parse_datetime(value)

        if parsed_dt:
            if timezone.is_naive(parsed_dt):
                return timezone.make_aware(parsed_dt)
            return parsed_dt

        parsed_date = parse_date(value)

        if parsed_date:
            dt = datetime.combine(parsed_date, time.min)
            return timezone.make_aware(dt)

    raise ValueError(f"Invalid datetime value: {value}")

def clean_text(value):
    return str(value or "").strip()

def parse_booking_date(value):
    parsed_value = safe_datetime(value)

    if not parsed_value:
        raise ValueError("Invalid consultation date.")

    return parsed_value


def get_appointment_payload_from_payment(payment):
    if hasattr(payment, "raw_request"):
        raw_request = payment.raw_request or {}
        return raw_request.get("appointment") or {}

    if hasattr(payment, "request_payload"):
        request_payload = payment.request_payload or {}
        return request_payload.get("appointment") or {}

    return {}


def get_payment_reference(payment, gateway):
    if gateway == "ESEWA":
        return payment.reference_code or payment.transaction_uuid

    if gateway == "CONNECTIPS":
        return payment.nchl_txn_id or payment.txn_id

    if gateway == "KHALTI":
        return payment.transaction_id or payment.purchase_order_id

    return ""


def get_payment_amount(payment):
    return Decimal(str(payment.amount or "0"))

def calculate_queue_for_booking(booking):
    group = clean_text(booking.fldgroup)
    department = clean_text(booking.fldadmitlocat)

    consult_datetime = safe_datetime(booking.fldconsultdate)
    admin_datetime = safe_datetime(booking.fldptadmindate)

    if not group:
        raise ValueError("Booking group is missing.")

    if not department:
        raise ValueError("Booking department is missing.")

    if not consult_datetime:
        raise ValueError("Booking consultation date is missing.")

    if not admin_datetime:
        raise ValueError("Booking admin date is missing.")

    consult_date = consult_datetime.date()

    earlier_count = (
        Tblonlinebook.objects.using(LEGACY_DB)
        .annotate(
            group_clean=Trim("fldgroup"),
            department_clean=Trim("fldadmitlocat"),
        )
        .filter(
            group_clean=group,
            department_clean=department,
            fldconsultdate__date=consult_date,
            fldptadmindate__lt=admin_datetime,
        )
        .count()
    )

    row_index = earlier_count + 1
    offset = row_index - 1

    with connections[LEGACY_DB].cursor() as cursor:
        cursor.execute(
            """
            SELECT 
                fldqueue,
                RIGHT(CAST(fldconsultstart AS CHAR), 8) AS expected_time
            FROM tblwebqueue
            WHERE TRIM(fldgroup) = %s
              AND TRIM(flddepartment) = %s
            ORDER BY fldconsultstart ASC, fldid ASC
            LIMIT 1 OFFSET %s
            """,
            [group, department, offset],
        )

        row = cursor.fetchone()

    logger.debug(
        "appointment queue group=%s dept=%s date=%s earlier=%s index=%s",
        group, department, consult_date, earlier_count, row_index,
    )

    if not row:
        raise ValueError(
            f"No queue slot available. group={group}, department={department}, row_index={row_index}"
        )

    queue_number = row[0]
    expected_time = str(row[1] or "")[:5]

    return {
        "row_index": row_index,
        "queue_number": queue_number,
        "expected_time": expected_time,
    }

def build_booking_confirmation(booking, appointment_payload, queue_data):
    queue_number = queue_data.get("queue_number") if queue_data else None
    expected_time = queue_data.get("expected_time") if queue_data else None
    row_index = queue_data.get("row_index") if queue_data else None
    queue_pending = not bool(queue_number)

    return {
        "booking_id": booking.fldbookingval,
        "queue_number": queue_number,
        "expected_time": expected_time,
        "row_index": row_index,
        "department": booking.fldadmitlocat,
        "group": booking.fldgroup,
        "scheme": booking.flddisctype,
        "consult_date": booking.fldconsultdate.date().isoformat() if booking.fldconsultdate else "",
        "item_name": appointment_payload.get("item_name"),
        "item_cost": str(appointment_payload.get("item_cost") or booking.flditemamt or "0"),
        "queue_pending": queue_pending,
        "advisory": "Please arrive 15 minutes early." if not queue_pending else "",
        "message": (
            "Please visit the hospital for your booking detail."
            if queue_pending
            else f"Your queue number is {queue_number}"
        ),
    }


def _sync_online_booking(booking, appointment_payload, queue_data):
    consult_date = None
    if booking.fldconsultdate:
        dt = safe_datetime(booking.fldconsultdate)
        consult_date = dt.date() if dt else None

    OnlineBooking.objects.update_or_create(
        booking_id=booking.fldbookingval,
        defaults={
            "patient_id": clean_text(booking.fldpatientval),
            "first_name": clean_text(booking.fldptnamefir),
            "last_name": clean_text(booking.fldptnamelast),
            "consult_date": consult_date,
            "department": clean_text(booking.fldadmitlocat),
            "group": clean_text(booking.fldgroup),
            "scheme": clean_text(booking.flddisctype),
            "consultant": clean_text(booking.flduserid),
            "item_name": clean_text(appointment_payload.get("item_name")),
            "item_cost": booking.flditemamt,
            "queue_number": queue_data.get("queue_number") if queue_data else None,
            "expected_time": queue_data.get("expected_time") if queue_data else "",
            "state": clean_text(booking.fldstate) or "Booked",
            "billing_mode": clean_text(booking.fldbillingmode),
            "payment_reference": clean_text(booking.fldpayreference),
        },
    )


def create_booking_after_success(payment, gateway):
    """
    Called after verified payment success.
    """

    appointment_payload = get_appointment_payload_from_payment(payment)

    if not appointment_payload:
        raise ValueError("Appointment payload missing from payment transaction.")

    booking_id = ""

    if gateway == "ESEWA":
        booking_id = payment.encounter_id

    if gateway == "CONNECTIPS":
        booking_id = appointment_payload.get("booking_id")

    if not booking_id:
        booking_id = generate_booking_id()

    existing_booking = (
        Tblonlinebook.objects.using(LEGACY_DB)
        .filter(fldbookingval=booking_id)
        .first()
    )

    if existing_booking:
        try:
            queue_data = calculate_queue_for_booking(existing_booking)
        except ValueError as exc:
            logger.warning("Queue slot unavailable for existing booking %s: %s", booking_id, exc)
            queue_data = None
        _sync_online_booking(existing_booking, appointment_payload, queue_data)
        return build_booking_confirmation(
            booking=existing_booking,
            appointment_payload=appointment_payload,
            queue_data=queue_data,
        )

    patient_id = payment.patient_id
    payment_reference = get_payment_reference(payment, gateway)
    payment_amount = get_payment_amount(payment)
    consult_date = parse_booking_date(appointment_payload.get("consult_date"))
    now_time = timezone.now()

    with transaction.atomic(using=LEGACY_DB):
        patient = (
            Tblpatientinfo.objects.using(LEGACY_DB)
            .filter(fldpatientval=patient_id)
            .first()
        )
        group = clean_text(appointment_payload.get("group"))
        department = clean_text(appointment_payload.get("department"))
        scheme = clean_text(appointment_payload.get("scheme"))
        consultant = clean_text(appointment_payload.get("consultant"))
        
        booking = Tblonlinebook.objects.using(LEGACY_DB).create(
            fldbookingval=booking_id,
            fldpatientval=patient_id,

            fldptnamefir=patient.fldptnamefir if patient else None,
            fldptnamelast=patient.fldptnamelast if patient else None,
            fldethniccode=patient.fldethniccode if patient else None,
            fldptsex=patient.fldptsex if patient else None,
            fldptaddvill=patient.fldptaddvill if patient else None,
            fldptaddward=patient.fldptaddward if patient else None,
            fldptadddist=patient.fldptadddist if patient else None,
            fldptcontact=patient.fldptcontact if patient else None,
            fldptguardian=patient.fldptguardian if patient else None,
            fldrelation=patient.fldrelation if patient else None,
            fldptbirday=safe_datetime(patient.fldptbirday) if patient and patient.fldptbirday else None,
            fldemail=patient.fldemail if patient else None,
            fldptcode=patient.fldptcode if patient else None,

            fldptadmindate=safe_datetime(now_time),
            fldconsultdate=safe_datetime(consult_date),
            fldcomp="WEB",
            fldstate="Paid",

            fldbillingmode=gateway,
            fldorduserid=patient_id,
            fldpayreference=payment_reference,
            fldhospital=None,
            fldcomment=gateway,
            fldencounterval=booking_id,
            fldbillno=payment_reference,
            fldremotemail=None,
            fldhashcode=uuid.uuid4().hex,
            flditemamt=float(payment_amount),
            fldgroup=group,
            fldadmitlocat=department,
            flduserid=consultant,
            flddisctype=scheme,

        )

    try:
        queue_data = calculate_queue_for_booking(booking)
    except ValueError as exc:
        logger.warning("Queue slot unavailable for new booking %s: %s", booking_id, exc)
        queue_data = None

    _sync_online_booking(booking, appointment_payload, queue_data)

    return build_booking_confirmation(
        booking=booking,
        appointment_payload=appointment_payload,
        queue_data=queue_data,
    )