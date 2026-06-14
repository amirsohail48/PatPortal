import json
import logging

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from legacy_hmis.models import Tblpatientpass
from accounts.legacy_password import check_legacy_password, encode_ascii_chunk_password
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.db import transaction

logger = logging.getLogger(__name__)


@ensure_csrf_cookie
@require_GET
def csrf_token(request):
    token = get_token(request)

    return JsonResponse({
        "success": True,
        "csrfToken": token,
    })

@require_GET
def auth_status(request):
    """
    Checks if user is logged in.
    For patient login, request.user.username should be patient_id.
    """
    if not request.user.is_authenticated:
        return JsonResponse({
            "authenticated": False,
            "patient_id": "",
        })

    return JsonResponse({
        "authenticated": True,
        "patient_id": request.user.username,
    })


@csrf_protect
@require_POST
def login_api(request):
    """
    Patient login API.

    Expected JSON from React:
    {
        "username": "PATIENT_ID",
        "password": "PASSWORD"
    }
    """

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    patient_id = str(payload.get("username", "")).strip()
    password = str(payload.get("password", "")).strip()

    if not patient_id or not password:
        return JsonResponse({
            "success": False,
            "error": "Patient ID and password are required"
        }, status=400)

    logger.info("Login attempt for patient_id=%s", patient_id)

    user = authenticate(
        request,
        username=patient_id,
        password=password
    )

    if user is None:
        logger.warning("Login failed for patient_id=%s", patient_id)

        return JsonResponse({
            "success": False,
            "error": "Invalid patient ID or password"
        }, status=400)

    login(request, user)

    return JsonResponse({
        "success": True,
        "message": "Login successful",
        "patient_id": user.username,
    })


@csrf_protect
@require_POST
def logout_api(request):
    """
    Logs out current patient/session.
    """
    logout(request)

    return JsonResponse({
        "success": True,
        "message": "Logout successful"
    })

@csrf_protect
@require_POST
def update_password_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "error": "Authentication required",
        }, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        payload = {}

    current_password = str(payload.get("current_password", ""))
    new_password = str(payload.get("new_password", ""))
    confirm_password = str(payload.get("confirm_password", ""))

    if not current_password:
        return JsonResponse({
            "success": False,
            "error": "Current password is required",
        }, status=400)

    if not new_password:
        return JsonResponse({
            "success": False,
            "error": "New password is required",
        }, status=400)

    if new_password != confirm_password:
        return JsonResponse({
            "success": False,
            "error": "New password and confirm password do not match",
        }, status=400)

    if len(new_password) < 6:
        return JsonResponse({
            "success": False,
            "error": "Password must be at least 6 characters",
        }, status=400)

    if current_password == new_password:
        return JsonResponse({
            "success": False,
            "error": "New password cannot be same as current password",
        }, status=400)

    try:
        patient_id = request.user.username
        UserModel = get_user_model()

        # auth_user is in default/new database
        user = UserModel.objects.using("default").get(username=patient_id)

        # tblpatientpass is in legacy_hmis database
        patient_pass = Tblpatientpass.objects.using("legacy_hmis").get(
            fldpatientval=patient_id
        )

        auth_password_ok = user.check_password(current_password)
        legacy_password_ok = check_legacy_password(
            current_password,
            patient_pass.fldpass,
        )

        if not auth_password_ok and not legacy_password_ok:
            return JsonResponse({
                "success": False,
                "error": "Current password is incorrect",
            }, status=400)

        # Update both databases
        with transaction.atomic(using="default"):
            with transaction.atomic(using="legacy_hmis"):
                # Update legacy password
                patient_pass.fldpass = encode_ascii_chunk_password(new_password)
                patient_pass.save(
                    using="legacy_hmis",
                    update_fields=["fldpass"],
                )

                # Update Django auth_user password
                user.set_password(new_password)
                user.save(
                    using="default",
                    update_fields=["password"],
                )

        # Keep current user logged in after password change
        update_session_auth_hash(request, user)

        return JsonResponse({
            "success": True,
            "message": "Password updated successfully",
        })

    except UserModel.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Auth user record not found",
        }, status=404)

    except Tblpatientpass.DoesNotExist:
        return JsonResponse({
            "success": False,
            "error": "Patient legacy login record not found",
        }, status=404)

    except Exception as error:
        return JsonResponse({
            "success": False,
            "error": str(error),
        }, status=400)