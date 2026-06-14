from legacy_hmis.models import Tblencounter, Tblpatientinfo


def format_datetime(value):
    if not value:
        return ""

    try:
        return value.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)
    
def get_patient_encounters(patient_id):
    encounters = (
        Tblencounter.objects
        .filter(fldpatientval=patient_id)
        .order_by("-fldregdate", "-fldencounterval")
    )

    return [
        {
            "encounter_id": item.fldencounterval,
            "date": item.fldregdate.strftime("%Y-%m-%d") if item.fldregdate else "",
            "visit_type": item.fldvisit or "",
            "billing_mode": item.fldbillingmode or "",
        }
        for item in encounters
    ]

def get_latest_encounter_id(patient_id):
    encounter = (
        Tblencounter.objects
        .filter(fldpatientval=patient_id)
        .order_by("-fldregdate")
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
        "gender": patient.fldptsex if patient else "",
        "contact": patient.fldptcontact if patient else "",
        "email": patient.fldemail if patient else "",
        "guardian": patient.fldptguardian if patient else "",
        "relation": patient.fldrelation if patient else "",
        "encounter_id": encounter_id,
        "reg_date": format_datetime(encounter.fldregdate),
        "visit_type": encounter.fldvisit or "",
        "billing_mode": encounter.fldbillingmode or "",
        "discount_type": encounter.flddisctype or "",
    }

def get_patient_encounter_ids(patient_id):
    """
    Get all encounter IDs of logged-in patient from tblencounter.
    """
    return list(
        Tblencounter.objects
        .filter(fldpatientval=patient_id)
        .values_list("fldencounterval", flat=True)
    )
