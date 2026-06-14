from django.urls import path
from . import views

urlpatterns = [
    path("encounters/", views.patient_encounters_api, name="patient_encounters_api"),
    path("archived/", views.archived_reports_api, name="archived_reports_api"),
    path("file/<int:report_id>/", views.report_file_api, name="report_file_api"),
    
    # New clinical summary / prescription APIs
    path("clinical/encounters/", views.clinical_encounters_api, name="clinical_encounters_api"),
    path("clinical/", views.clinical_summary_api, name="clinical_summary_api"),
    path("clinical/download/", views.clinical_summary_download_api, name="clinical_summary_download_api"),
]