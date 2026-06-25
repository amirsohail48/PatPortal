from datetime import datetime, date, time, timedelta
from decimal import Decimal

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from legacy_hmis.models import (
    Tblquota,
    Tblonlinebook,
    Tbldiscount,
    Tblautogroup,
    Tblservicecost,
    Tblwebqueue,
    Tbluser,
)
from appointments.models import OnlineBooking

LEGACY_DB = "legacy_hmis"


GROUP_DESCRIPTIONS = {
    "General OPD": "07:00 - 16:00. Saturday is off for all OPDs. Wednesday Male OPD & Female OPD opens and other OPDs close.",
    "PPC": "Private clinic with higher price started from 8:00 AM - 16:00 every day except Wednesday & Saturday.",
    "PPP": "Private clinic with higher price started from 16:00 - 19:00 every day except Wednesday & Saturday. Wednesday PPP is 8:00 - 12:00 noon.",
}


def clean_text(value):
    return str(value or "").strip()

from functools import lru_cache


@lru_cache(maxsize=2048)
def get_consultant_display_name(consultant_id):
    consultant_id = clean_text(consultant_id)

    if not consultant_id or consultant_id == "%":
        return ""

    user = (
        Tbluser.objects.using(LEGACY_DB)
        .filter(flduserid=consultant_id)
        .first()
    )

    if user and clean_text(user.fldusername):
        return clean_text(user.fldusername)

    return consultant_id


def parse_date_only(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value.date()

    parsed_datetime = parse_datetime(str(value))
    if parsed_datetime:
        return parsed_datetime.date()

    parsed_date = parse_date(str(value))
    if parsed_date:
        return parsed_date

    raise ValueError("Invalid consultation date")


def normalize_datetime_date(value):
    date_value = parse_date_only(value)

    if not date_value:
        return None

    naive_datetime = datetime.combine(date_value, time.min)

    if timezone.is_naive(naive_datetime):
        return timezone.make_aware(naive_datetime)

    return naive_datetime


def format_time(value):
    if not value:
        return ""

    return value.strftime("%H:%M")


def get_bookday_for_scheme(scheme):
    scheme = clean_text(scheme)

    if not scheme or scheme == "%":
        return 30

    discount = (
        Tbldiscount.objects.using(LEGACY_DB)
        .filter(fldtype=scheme, fldonline="Enable")
        .first()
    )

    if not discount or not discount.fldbookday:
        return 30

    return int(discount.fldbookday)

def get_queue_slot_count(group, department):
    return (
        Tblwebqueue.objects.using(LEGACY_DB)
        .filter(
            fldgroup=group,
            flddepartment=department,
        )
        .count()
    )


def get_remaining_slots(group, department, consult_date, web_quota):
    consult_date_only = parse_date_only(consult_date)

    if not consult_date_only:
        return 0

    booked_count = (
        Tblonlinebook.objects.using(LEGACY_DB)
        .filter(
            fldgroup=group,
            fldadmitlocat=department,
            fldconsultdate__date=consult_date_only,
        )
        .count()
    )

    quota_count = int(web_quota or 0)
    queue_slot_count = get_queue_slot_count(group, department)

    # IMPORTANT:
    # If tblwebqueue is not configured, use tblquota.fldwebquota directly.
    if queue_slot_count <= 0:
        bookable_count = quota_count
    else:
        bookable_count = min(quota_count, queue_slot_count)

    return max(bookable_count - booked_count, 0)


def resolve_item_name_and_cost(quota, selected_scheme):
    """
    Priority:
    1. Use tblquota.flditemname and tblquota.flditemcost if present.
    2. If missing, get item name from tblautogroup.
    3. Then get item cost from tblservicecost.
    """

    item_name = clean_text(quota.flditemname)
    item_cost = quota.flditemcost

    if not item_name:
        auto_group = (
            Tblautogroup.objects.using(LEGACY_DB)
            .filter(
                fldgroup=quota.flddepartment,
                flddisctype=selected_scheme,
                fldfollow="New",
            )
            .first()
        )

        if auto_group:
            item_name = clean_text(auto_group.flditemname)

    if item_name and (item_cost is None or float(item_cost or 0) <= 0):
        service_cost = (
            Tblservicecost.objects.using(LEGACY_DB)
            .filter(flditemname=item_name)
            .first()
        )

        if service_cost:
            item_cost = service_cost.flditemcost

    if not item_name:
        raise ValueError("Appointment item name is not configured.")

    if item_cost is None or Decimal(str(item_cost)) <= 0:
        raise ValueError("Appointment item cost is not configured.")

    return item_name, Decimal(str(item_cost))


def serialize_quota(quota, selected_scheme=None):
    quota_scheme = clean_text(quota.fldscheme) or "%"
    usable_scheme = selected_scheme or quota_scheme

    if usable_scheme == "%":
        usable_scheme = quota_scheme

    item_name = clean_text(quota.flditemname)
    item_cost = quota.flditemcost

    try:
        resolved_item_name, resolved_item_cost = resolve_item_name_and_cost(
            quota=quota,
            selected_scheme=usable_scheme,
        )
        item_name = resolved_item_name
        item_cost = resolved_item_cost
    except Exception:
        item_cost = Decimal(str(item_cost or 0))

    remaining_slots = get_remaining_slots(
        group=quota.fldgroup,
        department=quota.flddepartment,
        consult_date=quota.fldconsultdate,
        web_quota=quota.fldwebquota,
    )

    consultant_id = clean_text(quota.fldconsultant)
    consultant_name = get_consultant_display_name(consultant_id)

    return {
        "id": quota.fldid,
        "group": quota.fldgroup,
        "group_description": GROUP_DESCRIPTIONS.get(quota.fldgroup, ""),
        "scheme": quota_scheme,
        "scheme_label": "All Schemes" if quota_scheme == "%" else quota_scheme,
        "department": quota.flddepartment,

        # important for frontend
        "consultant_id": consultant_id,
        "consultant_name": consultant_name,
        "consultant": consultant_name or "Any Consultant",

        "consult_date": quota.fldconsultdate.date().isoformat() if quota.fldconsultdate else "",
        "web_quota": quota.fldwebquota or 0,
        "remaining_slots": remaining_slots,
        "start_time": format_time(quota.fldconsultstart) or "08:00",
        "end_time": format_time(quota.fldconsultend) or "16:00",
        "duration": quota.fldconsultduration or 10,
        "item_name": item_name,
        "item_cost": str(item_cost or "0"),
    }


def get_quota_options(group=None, scheme=None, department=None, consultant=None):
    today = timezone.localdate()

    qs = (
        Tblquota.objects.using(LEGACY_DB)
        .filter(fldconsultdate__date__gte=today)
        .order_by(
            "fldgroup",
            "fldscheme",
            "flddepartment",
            "fldconsultdate",
            "fldconsultstart",
        )
    )

    if group:
        qs = qs.filter(fldgroup=group)

    if scheme:
        qs = qs.filter(fldscheme__in=[scheme, "%"])

        bookday = get_bookday_for_scheme(scheme)
        max_date = today + timedelta(days=max(bookday - 1, 0))
        qs = qs.filter(fldconsultdate__date__lte=max_date)

    if consultant and consultant not in ["Any Consultant", "%"]:
        qs = qs.filter(fldconsultant=consultant)

    if department:
        qs = qs.filter(flddepartment=department)

    return [serialize_quota(quota, selected_scheme=scheme) for quota in qs]


def get_quota_by_id(quota_id):
    quota = Tblquota.objects.using(LEGACY_DB).get(fldid=quota_id)
    return serialize_quota(quota)


def validate_appointment_before_payment(appointment, patient_id=None):
    """
    Called before payment initiation.

    """

    quota_id = appointment.get("quota_id")
    selected_group = clean_text(appointment.get("group"))
    selected_scheme = clean_text(appointment.get("scheme"))
    selected_department = clean_text(appointment.get("department"))
    selected_date = parse_date_only(appointment.get("consult_date"))

    if not quota_id:
        raise ValueError("quota_id is required.")

    if not selected_group:
        raise ValueError("Group is required.")

    if not selected_scheme:
        raise ValueError("Scheme is required.")

    if not selected_department:
        raise ValueError("Department is required.")

    if not selected_date:
        raise ValueError("Consultation date is required.")

    if patient_id and selected_department and selected_group:
        already_booked = OnlineBooking.objects.filter(
            patient_id=patient_id,
            group=selected_group,
            department=selected_department,
            consult_date__gte=date.today(),
        ).exists()

        if already_booked:
            raise ValueError(
                f"You already have an upcoming appointment in {selected_department} ({selected_group}). "
                "Please complete your existing appointment before booking a new one."
            )

    quota = Tblquota.objects.using(LEGACY_DB).get(fldid=quota_id)

    quota_scheme = clean_text(quota.fldscheme) or "%"

    if clean_text(quota.fldgroup) != selected_group:
        raise ValueError("Selected group does not match quota.")

    if clean_text(quota.flddepartment) != selected_department:
        raise ValueError("Selected department does not match quota.")

    if quota.fldconsultdate.date() != selected_date:
        raise ValueError("Selected date does not match quota.")

    if quota_scheme not in [selected_scheme, "%"]:
        raise ValueError("Selected scheme is not allowed for this quota.")

    remaining_slots = get_remaining_slots(
        group=selected_group,
        department=selected_department,
        consult_date=selected_date,
        web_quota=quota.fldwebquota,
    )

    if remaining_slots <= 0:
        raise ValueError("No slot available for selected appointment.")

    item_name, item_cost = resolve_item_name_and_cost(
        quota=quota,
        selected_scheme=selected_scheme,
    )

    return {
        "quota_id": quota.fldid,
        "group": selected_group,
        "scheme": selected_scheme,
        "department": selected_department,
        "consultant": quota.fldconsultant or appointment.get("consultant") or "Any Consultant",
        "consult_date": selected_date.isoformat(),
        "consult_start": format_time(quota.fldconsultstart),
        "consult_end": format_time(quota.fldconsultend),
        "duration": quota.fldconsultduration or 0,
        "web_quota": quota.fldwebquota or 0,
        "remaining_slots": remaining_slots,
        "item_name": item_name,
        "item_cost": str(item_cost),
    }