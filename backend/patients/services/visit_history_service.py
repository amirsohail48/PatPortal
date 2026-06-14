from legacy_hmis.models import Tblconsult, Tblencounter
from patients.services.encounter_service import get_patient_summary_by_encounter, get_patient_encounter_ids


def format_datetime(value):
    if not value:
        return ""

    try:
        return value.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)

def get_visit_history(patient_id, encounter_id=None, status=None):
    """
    If encounter_id is empty:
        return all visits of patient from all encounters.

    If encounter_id is provided:
        return visits only for that encounter.
    """

    encounter_ids = get_patient_encounter_ids(patient_id)

    if not encounter_ids:
        return {
            "patient": None,
            "summary": {
                "total_visits": 0,
                "planned": 0,
                "completed": 0,
                "cancelled": 0,
            },
            "visits": [],
        }

    queryset = Tblconsult.objects.filter(
        fldencounterval__in=encounter_ids
    )

    if encounter_id:
        if encounter_id not in encounter_ids:
            raise PermissionError("You are not allowed to access this encounter")

        queryset = queryset.filter(fldencounterval=encounter_id)

    if status:
        queryset = queryset.filter(fldstatus__iexact=status)

    queryset = queryset.order_by("-fldconsulttime", "-fldtime", "-fldid")

    visits = []

    for item in queryset:
        visits.append({
            "id": item.fldid,
            "encounter_id": item.fldencounterval or "",
            "consult_id": item.fldconsultid or "",
            "department": item.fldconsultname or "",
            "consult_time": format_datetime(item.fldconsulttime),
            "created_time": format_datetime(item.fldtime),
            "comment": item.fldcomment or "",
            "status": item.fldstatus or "",
            "doctor_user": item.flduserid or "",
            "ordered_by": item.fldorduserid or "",
            "billing_mode": item.fldbillingmode or "",
            "outcome": item.fldoutcome or "",
            "notice": item.fldnotice or "",
            "component": item.fldcomp or "",
            "pre_summary": item.fldpresummary or "",
            "referto": item.fldreferto or "",
            "follow_date": format_datetime(item.fldfollowdate),
            "summary": item.fldsummary or "",
        })

    total_visits = len(visits)

    planned = sum(
        1 for visit in visits
        if str(visit["status"]).lower() == "planned"
    )

    completed = sum(
        1 for visit in visits
        if str(visit["status"]).lower() == "completed"
    )

    cancelled = sum(
        1 for visit in visits
        if str(visit["status"]).lower() == "cancelled"
    )

    patient = get_patient_summary_by_encounter(
        patient_id,
        encounter_id or encounter_ids[0]
    )

    return {
        "patient": patient,
        "summary": {
            "total_visits": total_visits,
            "planned": planned,
            "completed": completed,
            "cancelled": cancelled,
        },
        "visits": visits,
    }