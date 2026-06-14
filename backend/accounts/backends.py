import logging
from datetime import datetime, date, time

from django.contrib.auth.backends import BaseBackend
from django.contrib.auth import get_user_model
from django.utils import timezone

from legacy_hmis.models import Tblpatientpass
from .legacy_password import check_legacy_password


logger = logging.getLogger(__name__)


class PatientLegacyBackend(BaseBackend):
    """
    Authenticates patients using existing tblpatientpass table.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            logger.warning("AUTH DEBUG: missing username or password")
            return None

        patient_id = str(username).strip()

        try:
            patient_pass = Tblpatientpass.objects.using("legacy_hmis").get(
                fldpatientval__iexact=patient_id
            )
        except Tblpatientpass.DoesNotExist:
            logger.warning("AUTH DEBUG: no tblpatientpass row for %s", patient_id)
            return None

        logger.warning(
            "AUTH DEBUG: row found patient=%s status=%s xyz=%s from=%s to=%s",
            patient_pass.fldpatientval,
            getattr(patient_pass, "fldstatus", None),
            getattr(patient_pass, "xyz", None),
            getattr(patient_pass, "fldfromdate", None),
            getattr(patient_pass, "fldtodate", None),
        )

        # Status check: only block if status is present and not active
        status = str(getattr(patient_pass, "fldstatus", "") or "").strip().lower()
        if status and status != "active":
            logger.warning("AUTH DEBUG: blocked by fldstatus=%s", status)
            return None

        # IMPORTANT:
        # Do not block by xyz unless you are 100% sure xyz means active flag.
        # Many legacy systems use xyz differently.
        # If you confirm xyz must be 1, enable this block again.
        # xyz_value = getattr(patient_pass, "xyz", None)
        # if xyz_value not in (None, "") and str(xyz_value).strip() not in ("1", "1.0", "true", "True"):
        #     logger.warning("AUTH DEBUG: blocked by xyz=%s", xyz_value)
        #     return None

        now = timezone.now()

        from_date = self.make_safe_datetime(getattr(patient_pass, "fldfromdate", None))
        if from_date and from_date > now:
            logger.warning("AUTH DEBUG: blocked by future from_date=%s", from_date)
            return None

        to_date = self.make_safe_datetime(getattr(patient_pass, "fldtodate", None))
        if to_date and to_date < now:
            logger.warning("AUTH DEBUG: blocked by expired to_date=%s", to_date)
            return None

        stored_password = str(getattr(patient_pass, "fldpass", "") or "").strip()

        password_ok = check_legacy_password(password, stored_password)

        logger.warning(
            "AUTH DEBUG: password_ok=%s for patient=%s",
            password_ok,
            patient_id,
        )

        if not password_ok:
            return None

        UserModel = get_user_model()

        django_user, created = UserModel.objects.using("default").get_or_create(
            username=patient_pass.fldpatientval,
            defaults={
                "is_active": True,
                "is_staff": False,
                "is_superuser": False,
            },
        )

        if created:
            django_user.set_unusable_password()

        django_user.is_active = True
        django_user.is_staff = False
        django_user.is_superuser = False
        django_user.save(using="default")

        logger.warning("AUTH DEBUG: login success for %s", patient_id)

        return django_user

    def get_user(self, user_id):
        UserModel = get_user_model()

        try:
            return UserModel.objects.using("default").get(pk=user_id)
        except UserModel.DoesNotExist:
            return None

    @staticmethod
    def make_safe_datetime(value):
        if not value:
            return None

        if isinstance(value, datetime):
            return timezone.make_aware(value) if timezone.is_naive(value) else value

        if isinstance(value, date):
            dt = datetime.combine(value, time.min)
            return timezone.make_aware(dt)

        return None