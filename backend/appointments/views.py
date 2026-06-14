import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST,require_GET

from appointments.services.quota_services import (
    get_quota_options,
    get_quota_by_id,
)
from appointments.services.queue_service import calculate_patient_queue

@require_GET
def quota_options_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        quotas = get_quota_options(
            group=request.GET.get("group"),
            scheme=request.GET.get("scheme"),
            department=request.GET.get("department"),
            consultant=request.GET.get("consultant"),
        )

        return JsonResponse({
            "success": True,
            "quotas": quotas,
        })

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)


@require_GET
def quota_detail_api(request, quota_id):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        quota = get_quota_by_id(quota_id)

        return JsonResponse({
            "success": True,
            "quota": quota,
        })

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)
    

@csrf_protect
@require_POST
def appointment_queue_api(request):
    """
    Frontend sends:
    {
      "consult_date": "2026-06-15",
      "group": "General OPD",
      "department": "Orthopedics",
      "booking_id": "optional"
    }

    Scheme is not needed for queue calculation.
    """

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    try:
        patient_id = request.user.username

        data = calculate_patient_queue(
            patient_id=patient_id,
            consult_date=payload.get("consult_date"),
            group=payload.get("group"),
            department=payload.get("department"),
            booking_id=payload.get("booking_id"),
        )

        return JsonResponse({
            "success": True,
            "queue": data,
        })

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)