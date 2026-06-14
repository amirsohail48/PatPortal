import json
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET,require_POST
from legacy_hmis.models import Tblpatientinfo,Tblgrievances
from patients.services.visit_history_service import get_visit_history
from patients.services.encounter_service import get_patient_encounters

def normalize_grievance_status(status):
    status = str(status or "").strip().lower()

    if status in ["new", "solved","rejected"]:
        #print(status)
        return status

    #return "New"


def grievance_display_data(status, response_text):
    status = normalize_grievance_status(status)

    if status == "solved":
        return {
            "status_label": "Solved",
            "status_message": response_text or "Your grievance has been resolved.",
            "card_color": "green",
        }

    if status == "rejected":
        return {
            "status_label": "Rejected",
            "status_message": response_text or "Your grievance was rejected.",
            "card_color": "red",
        }

    return {
        "status_label": "New",
        "status_message": "Thank you for your feedback",
        "card_color": "grey",
    }

def calculate_age(birth_date):
    if not birth_date:
        return None

    from datetime import date

    today = date.today()
    birth_date = birth_date.date() if hasattr(birth_date, "date") else birth_date

    age = today.year - birth_date.year

    if (today.month, today.day) < (birth_date.month, birth_date.day):
        age -= 1

    return age


@require_GET
def patient_profile_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required"
        }, status=401)

    patient_id = request.user.username

    try:
        patient = Tblpatientinfo.objects.get(fldpatientval=patient_id)
    except Tblpatientinfo.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Patient profile not found"
        }, status=404)

    full_name = " ".join(
        part for part in [
            patient.fldptnamefir,
            patient.fldptnamelast
        ]
        if part
    )

    address = ", ".join(
        part for part in [
            patient.fldptaddvill,
            patient.fldptaddward,
            patient.fldptadddist
        ]
        if part
    )

    data = {
        "success": True,
        "patient": {
            "patient_id": patient.fldpatientval,
            "patient_code": patient.fldptcode,
            "full_name": full_name,
            "first_name": patient.fldptnamefir,
            "last_name": patient.fldptnamelast,
            "gender": patient.fldptsex,
            "age": calculate_age(patient.fldptbirday),
            "birth_date": patient.fldptbirday.strftime("%Y-%m-%d") if patient.fldptbirday else "",
            "contact": patient.fldptcontact,
            "email": patient.fldemail,
            "address": address,
            "district": patient.fldptadddist,
            "ward": patient.fldptaddward,
            "guardian": patient.fldptguardian,
            "relation": patient.fldrelation,
            "category": patient.fldcategory,
            "discount": patient.flddiscount,
            "registered_date": patient.fldptadmindate.strftime("%Y-%m-%d") if patient.fldptadmindate else "",
        }
    }

    return JsonResponse(data)

@require_GET
def visit_history_encounters_api(request):
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

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)


@require_GET
def visit_history_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username
        encounter_id = request.GET.get("encounter_id")
        status = request.GET.get("status")

        data = get_visit_history(
            patient_id=patient_id,
            encounter_id=encounter_id,
            status=status,
        )

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            **data,
        })

    except PermissionError as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=403)

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)
    
@require_GET
def grievance_list_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username

        grievances = (
            Tblgrievances.objects.using("legacy_hmis")
            .filter(fldpatientval=patient_id)
            .order_by("-fldid")
        )

        data = []

        for item in grievances:
            status = normalize_grievance_status(item.fldstatus)
            print(status)
            display = grievance_display_data(status, item.fldresponse)
            print(display)

            data.append({
                "id": item.fldid,
                "patient_id": item.fldpatientval,
                "contact": item.fldptcontact,
                "message": item.fldgrievance or "",
                "status": status,
                "response": item.fldresponse or "",
                "status_label": display["status_label"],
                "status_message": display["status_message"],
                "card_color": display["card_color"],
                "datetime": item.fldtime.isoformat() if item.fldtime else "",
            })

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "grievances": data,
        })

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=500)


@csrf_protect
@require_POST
def grievance_create_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    message = str(payload.get("message", "")).strip()
    contact = str(payload.get("contact", "")).strip()

    if not message:
        return JsonResponse({
            "success": False,
            "error": "Grievance message is required",
        }, status=400)

    patient_id = request.user.username

    grievance = Tblgrievances.objects.using("legacy_hmis").create(
        fldpatientval=patient_id,
        fldptcontact=contact,
        fldgrievance=message,
        fldstatus="New",
        fldresponse="",
    )

    return JsonResponse({
        "success": True,
        "message": "Grievance submitted successfully",
        "grievance": {
            "id": grievance.fldid,
            "patient_id": grievance.fldpatientval,
            "contact": grievance.fldptcontact,
            "message": grievance.fldgrievance,
            "status": grievance.fldstatus,
            "response": grievance.fldresponse or "",
            "status_label": "Pending",
            "status_message": "",
            "card_color": "grey",
        },
    })