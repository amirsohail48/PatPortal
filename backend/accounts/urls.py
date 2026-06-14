from django.urls import path
from . import views

urlpatterns = [
    path("csrf/", views.csrf_token, name="csrf_token"),
    path("auth/status/", views.auth_status, name="auth_status"),
    path("auth/login/", views.login_api, name="login_api"),
    path("auth/logout/", views.logout_api, name="logout_api"),
    path("auth/password/update/", views.update_password_api, name="update_password_api"),
]