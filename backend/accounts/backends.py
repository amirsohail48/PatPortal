from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.models import User
from django.utils import timezone

from legacy_hmis.models import Tblpatientpass
from .legacy_password import check_legacy_password


class PatientLegacyBackend(BaseBackend):
    """
    Authenticates patients using existing tblpatientpass table.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None

        try:
            patient_pass = Tblpatientpass.objects.using("legacy_hmis").get(fldpatientval=username)
        except Tblpatientpass.DoesNotExist:
            return None

        # Check status
        if str(patient_pass.fldstatus).lower() != "active":
            return None

        # Check xyz flag if used as active flag
        if patient_pass.xyz is not None and int(patient_pass.xyz) != 1:
            return None

        now = timezone.now()

        # Valid from date
        if patient_pass.fldfromdate:
            from_date = patient_pass.fldfromdate

            if timezone.is_naive(from_date):
                from_date = timezone.make_aware(from_date)

            if from_date > now:
                return None

        # Valid to date
        if patient_pass.fldtodate:
            to_date = patient_pass.fldtodate

            if timezone.is_naive(to_date):
                to_date = timezone.make_aware(to_date)

            if to_date < now:
                return None

        # Password check
        if not check_legacy_password(password, patient_pass.fldpass):
            return None

        # Create/sync Django user for session login
        django_user, created = User.objects.get_or_create(
            username=patient_pass.fldpatientval,
            defaults={
                "is_active": True,
                "is_staff": False,
                "is_superuser": False,
            }
        )

        if created:
            django_user.set_unusable_password()

        django_user.is_active = True
        django_user.is_staff = False
        django_user.is_superuser = False
        django_user.save()

        return django_user

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None