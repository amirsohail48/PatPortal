from django.urls import path
from . import views

urlpatterns = [
    path("profile/", views.patient_profile_api, name="patient_profile_api"),
    path("visit-history/", views.visit_history_api, name="visit_history_api"),
    path("visit-history/encounters/", views.visit_history_encounters_api, name="visit_history_encounters_api"),
    path("grievances/", views.grievance_list_api, name="grievance_list_api"),
    path("grievances/create/", views.grievance_create_api, name="grievance_create_api"),
]