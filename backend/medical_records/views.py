from django.http import JsonResponse, Http404, HttpResponse
from django.views.decorators.http import require_GET
from legacy_hmis.models import Tblencounter
from weasyprint import HTML

from patients.services.encounter_service import (
    get_patient_encounters,
    )
from .services.clinical_summary_services import (
    get_clinical_summary,
    build_summary_html,
)
from .services.report_service import (
    get_reports_by_encounter,
    get_report_file,
)


@require_GET
def patient_encounters_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    patient_id = request.user.username

    try:
        encounters = get_patient_encounters(patient_id)

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounters": encounters,
        })

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)


@require_GET
def archived_reports_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    patient_id = request.user.username
    encounter_id = request.GET.get("encounter_id")

    try:
        data = get_reports_by_encounter(
            patient_id=patient_id,
            encounter_id=encounter_id,
        )

        return JsonResponse({
            "success": True,
            "patient_id": patient_id,
            "encounter_id": data["encounter_id"],
            "categories": data["categories"],
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
def report_file_api(request, report_id):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        file_info = get_report_file(report_id)
        report = file_info["report"]

        # Security check: logged-in patient can only view own encounter reports
        owns_report = Tblencounter.objects.filter(
            fldpatientval=request.user.username,
            fldencounterval=report.fldencounterval,
        ).exists()

        if not owns_report:
            return JsonResponse({
                "success": False,
                "error": "You are not allowed to access this report",
            }, status=403)

        download = request.GET.get("download") == "1"


        response = HttpResponse(
            file_info["data"],
            content_type=file_info["content_type"],
        )

        disposition = "attachment" if download else "inline"

        response["Content-Disposition"] = (
            f'{disposition}; filename="{file_info["filename"]}"'
        )

        return response

    except Http404 as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=404)

    except Exception as error:
        print("REPORT FILE API ERROR:", repr(error))

        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)
    
@require_GET
def clinical_encounters_api(request):
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
def clinical_summary_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username
        encounter_id = request.GET.get("encounter_id")

        data = get_clinical_summary(patient_id, encounter_id)

        return JsonResponse({
            "success": True,
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
def clinical_summary_download_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        patient_id = request.user.username
        encounter_id = request.GET.get("encounter_id")

        data = get_clinical_summary(
            patient_id=patient_id,
            encounter_id=encounter_id,
        )

        html = build_summary_html(data)

        pdf_file = HTML(
            string=html,
            base_url=request.build_absolute_uri("/"),
        ).write_pdf()

        safe_encounter_id = str(encounter_id or "latest").replace("/", "-")

        response = HttpResponse(
            pdf_file,
            content_type="application/pdf",
        )

        response["Content-Disposition"] = (
            f'attachment; filename="clinical-summary-{safe_encounter_id}.pdf"'
        )

        return response

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