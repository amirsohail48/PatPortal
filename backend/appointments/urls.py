from django.urls import path
from . import views

urlpatterns = [
    path("quota-options/", views.quota_options_api, name="quota_options_api"),
    path("quota-options/<int:quota_id>/", views.quota_detail_api, name="quota_detail_api"),
    path("queue/", views.appointment_queue_api, name="appointment_queue_api"),
]