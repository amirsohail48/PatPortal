from django.urls import path
from . import views

urlpatterns = [
    path("encounters/", views.pacs_encounters_api, name="pacs_encounters_api"),
    path("studies/", views.pacs_studies_api, name="pacs_studies_api"),
    path("series/<str:study_id>/", views.pacs_series_api, name="pacs_series_api"),
    path("preview/<str:instance_id>/", views.pacs_preview_api, name="pacs_preview_api"),
]