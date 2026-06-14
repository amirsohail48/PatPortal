from django.http import JsonResponse, HttpResponse, FileResponse
from django.views.decorators.http import require_GET

from legacy_hmis.models import Tblencounter
from pacs.services.orthanc_service import (
    find_studies_by_encounter,
    get_study_series,
    get_cached_instance_preview,
)


def format_datetime(value):
    if not value:
        return ""

    try:
        return value.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)


def patient_owns_encounter(patient_id, encounter_id):
    return Tblencounter.objects.filter(
        fldpatientval=patient_id,
        fldencounterval=encounter_id,
    ).exists()


@require_GET
def pacs_encounters_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    patient_id = request.user.username

    encounters = (
        Tblencounter.objects
        .filter(fldpatientval=patient_id)
        .order_by("-fldregdate", "-fldencounterval")
    )

    return JsonResponse({
        "success": True,
        "patient_id": patient_id,
        "encounters": [
            {
                "encounter_id": item.fldencounterval,
                "date": format_datetime(item.fldregdate),
                "visit_type": item.fldvisit or "",
                "billing_mode": item.fldbillingmode or "",
            }
            for item in encounters
        ],
    })


@require_GET
def pacs_studies_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username
        encounter_id = request.GET.get("encounter_id")

        if not encounter_id:
            return JsonResponse({
                "success": False,
                "error": "encounter_id is required",
            }, status=400)

        if not patient_owns_encounter(patient_id, encounter_id):
            return JsonResponse({
                "success": False,
                "error": "You are not allowed to access this encounter",
            }, status=403)

        studies = find_studies_by_encounter(
            encounter_id=encounter_id,
            patient_id=patient_id,
        )

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounter_id": encounter_id,
            "studies": studies,
        })

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)


@require_GET
def pacs_series_api(request, study_id):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        series = get_study_series(study_id)

        return JsonResponse({
            "success": True,
            "study_id": study_id,
            "series": series,
        })

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)



@require_GET
def pacs_preview_api(request, instance_id):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        preview = get_cached_instance_preview(instance_id)

        response = FileResponse(
            open(preview["path"], "rb"),
            content_type=preview["content_type"],
        )

        response["Cache-Control"] = "private, max-age=300"
        response["X-PACS-Preview-Source"] = preview["source"]

        return response

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)