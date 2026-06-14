from datetime import datetime

from legacy_hmis.models import Tblonlinebook, Tblwebqueue


def parse_date_only(value):
    """
    Accepts:
    2026-06-15
    2026-06-15T00:00:00
    datetime object
    """

    if not value:
        return None

    if hasattr(value, "date"):
        return value.date()

    value = str(value).strip()

    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def calculate_patient_queue(
    patient_id,
    consult_date,
    group,
    department,
    booking_id=None,
):
    """
    Queue calculation rule:

    1. Find all bookings from tblonlinebook for:
       fldconsultdate + fldgroup + fldadmitlocat

    2. Order by fldptadmindate.

    3. Find current patient's index.

    4. Get same index row from tblwebqueue for:
       fldgroup + flddepartment

    5. Return fldqueue and fldconsultstart.

    Scheme is intentionally ignored for queue calculation.
    """

    consult_date_only = parse_date_only(consult_date)

    if not consult_date_only:
        raise ValueError("Valid consult_date is required")

    if not group:
        raise ValueError("Group is required")

    if not department:
        raise ValueError("Department is required")

    bookings_qs = (
        Tblonlinebook.objects.using("legacy_hmis")
        .filter(
            fldconsultdate__date=consult_date_only,
            fldgroup=group,
            fldadmitlocat=department,
        )
        .order_by("fldptadmindate", "fldbookingval")
    )

    bookings = list(bookings_qs)

    current_index = None
    current_booking = None

    for index, booking in enumerate(bookings):
        same_patient = str(booking.fldpatientval or "") == str(patient_id)

        same_booking = False
        if booking_id:
            same_booking = str(booking.fldbookingval or "") == str(booking_id)

        if same_booking or same_patient:
            current_index = index
            current_booking = booking
            break

    if current_index is None:
        return {
            "found": False,
            "message": "Patient booking not found in queue list.",
            "queue_number": None,
            "expected_time": None,
            "position": None,
            "total_bookings": len(bookings),
        }

    queue_rows = list(
        Tblwebqueue.objects.using("legacy_hmis")
        .filter(
            fldgroup=group,
            flddepartment=department,
        )
        .order_by("fldconsultstart", "fldid")
    )

    if current_index >= len(queue_rows):
        return {
            "found": True,
            "message": "Queue position found, but web queue slot is not available.",
            "booking_id": current_booking.fldbookingval,
            "patient_id": current_booking.fldpatientval,
            "queue_number": None,
            "expected_time": None,
            "position": current_index + 1,
            "total_bookings": len(bookings),
        }

    queue_row = queue_rows[current_index]

    return {
        "found": True,
        "message": "Queue calculated successfully.",
        "booking_id": current_booking.fldbookingval,
        "patient_id": current_booking.fldpatientval,
        "group": group,
        "department": department,
        "consult_date": consult_date_only.isoformat(),
        "position": current_index + 1,
        "queue_number": queue_row.fldqueue,
        "expected_time": queue_row.fldconsultstart.isoformat() if queue_row.fldconsultstart else "",
        "total_bookings": len(bookings),
    }