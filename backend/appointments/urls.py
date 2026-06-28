from django.urls import path
from . import views

urlpatterns = [
    path("quota-options/", views.quota_options_api, name="quota_options_api"),
    path("quota-options/<int:quota_id>/", views.quota_detail_api, name="quota_detail_api"),
    path("queue/", views.appointment_queue_api, name="appointment_queue_api"),
    path("upcoming/", views.upcoming_appointments_api, name="upcoming_appointments_api"),
    path("reschedule-options/<str:booking_id>/", views.reschedule_options_api, name="reschedule_options_api"),
    path("reschedule/", views.reschedule_booking_api, name="reschedule_booking_api"),
]