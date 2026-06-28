from datetime import date, datetime, time

from django.db import connections
from django.utils import timezone

from appointments.models import OnlineBooking
from appointments.services.quota_services import (
    get_quota_options,
    get_consultant_display_name,
    get_remaining_slots,
    parse_date_only,
)
from legacy_hmis.models import Tblonlinebook, Tblquota

LEGACY_DB = "legacy_hmis"


def _get_queue_for_offset(group, department, offset):
    """Return (queue_number, expected_time) from tblwebqueue at the given offset."""
    with connections[LEGACY_DB].cursor() as cursor:
        cursor.execute(
            """
            SELECT fldqueue, RIGHT(CAST(fldconsultstart AS CHAR), 8) AS expected_time
            FROM tblwebqueue
            WHERE TRIM(fldgroup) = %s AND TRIM(flddepartment) = %s
            ORDER BY fldconsultstart ASC, fldid ASC
            LIMIT 1 OFFSET %s
            """,
            [group.strip(), department.strip(), offset],
        )
        row = cursor.fetchone()
    if row:
        return row[0], str(row[1] or "")[:5]
    return None, None


def _booked_count_for_date(group, department, consult_date):
    date_only = parse_date_only(consult_date)
    if not date_only:
        return 0
    return (
        Tblonlinebook.objects.using(LEGACY_DB)
        .filter(fldgroup=group, fldadmitlocat=department, fldconsultdate__date=date_only)
        .count()
    )


def get_reschedule_options(booking_id, patient_id):
    """
    Returns unique available dates, consultant options per date, and queue
    estimates so the frontend can drive a date → consultant → queue UX.
    """
    try:
        booking = OnlineBooking.objects.get(booking_id=booking_id, patient_id=patient_id)
    except OnlineBooking.DoesNotExist:
        raise ValueError("Booking not found or access denied.")

    scheme = booking.scheme if booking.scheme and booking.scheme != "%" else None

    all_slots = get_quota_options(
        group=booking.group,
        scheme=scheme,
        department=booking.department,
    )

    current_date = booking.consult_date.isoformat() if booking.consult_date else None

    # Only slots with remaining capacity on dates other than the current one
    eligible = [
        s for s in all_slots
        if s["remaining_slots"] > 0 and s["consult_date"] != current_date
    ]

    # Attach queue estimate to each slot
    enriched = []
    for slot in eligible:
        booked = _booked_count_for_date(
            slot["group"], slot["department"], slot["consult_date"]
        )
        q_num, q_time = _get_queue_for_offset(
            slot["group"], slot["department"], booked
        )
        enriched.append({
            **slot,
            "booked_count": booked,
            "estimated_queue_number": q_num,
            "estimated_queue_time": q_time or "",
        })

    consultant_display = get_consultant_display_name(booking.consultant) if booking.consultant else ""

    return {
        "booking": {
            "booking_id": booking.booking_id,
            "group": booking.group,
            "scheme": booking.scheme,
            "department": booking.department,
            "consultant_id": booking.consultant,
            "consultant_name": consultant_display or booking.consultant,
            "consult_date": current_date or "",
            "item_name": booking.item_name,
        },
        "available_slots": enriched,
    }


def reschedule_booking(booking_id, patient_id, quota_id):
    """
    Reschedules a booking to a new slot (date + optionally consultant).
    Calculates the actual queue number and updates both portal DB and legacy HMIS DB.
    """
    try:
        booking = OnlineBooking.objects.get(booking_id=booking_id, patient_id=patient_id)
    except OnlineBooking.DoesNotExist:
        raise ValueError("Booking not found or access denied.")

    try:
        quota = Tblquota.objects.using(LEGACY_DB).get(fldid=quota_id)
    except Tblquota.DoesNotExist:
        raise ValueError("Selected slot not found.")

    if (quota.fldgroup or "").strip() != booking.group:
        raise ValueError("Cannot change group when rescheduling.")
    if (quota.flddepartment or "").strip() != booking.department:
        raise ValueError("Cannot change department when rescheduling.")

    new_date = quota.fldconsultdate.date() if quota.fldconsultdate else None
    if not new_date:
        raise ValueError("Selected slot has no date.")

    if date.today() >= new_date:
        raise ValueError(
            f"Cannot reschedule to {new_date.strftime('%d %b %Y')} — "
            "appointments must be booked before the visit date."
        )

    remaining = get_remaining_slots(
        group=quota.fldgroup,
        department=quota.flddepartment,
        consult_date=quota.fldconsultdate,
        web_quota=quota.fldwebquota,
    )
    if remaining <= 0:
        raise ValueError("No slots available for the selected date.")

    new_consultant_id = (quota.fldconsultant or "").strip() or booking.consultant
    new_consultant_name = get_consultant_display_name(new_consultant_id) if new_consultant_id else ""

    # Calculate queue for the new slot (offset = current booked count for that date)
    booked = _booked_count_for_date(
        quota.fldgroup, quota.flddepartment, quota.fldconsultdate
    )
    queue_number, expected_time = _get_queue_for_offset(
        quota.fldgroup, quota.flddepartment, booked
    )

    # Update portal DB
    booking.consult_date = new_date
    booking.consultant = new_consultant_id
    booking.queue_number = queue_number
    booking.expected_time = expected_time or ""
    booking.save(update_fields=["consult_date", "consultant", "queue_number", "expected_time"])

    # Update legacy HMIS DB
    legacy_booking = (
        Tblonlinebook.objects.using(LEGACY_DB)
        .filter(fldbookingval=booking_id)
        .first()
    )
    if legacy_booking:
        naive_dt = datetime.combine(new_date, time.min)
        aware_dt = timezone.make_aware(naive_dt) if timezone.is_naive(naive_dt) else naive_dt
        legacy_booking.fldconsultdate = aware_dt
        if new_consultant_id:
            legacy_booking.flduserid = new_consultant_id
        legacy_booking.save(using=LEGACY_DB, update_fields=["fldconsultdate", "flduserid"])

    return {
        "booking_id": booking.booking_id,
        "new_date": new_date.isoformat(),
        "department": booking.department,
        "group": booking.group,
        "scheme": booking.scheme,
        "consultant_id": new_consultant_id,
        "consultant_name": new_consultant_name or new_consultant_id,
        "item_name": booking.item_name,
        "queue_number": queue_number,
        "expected_time": expected_time or "",
    }
