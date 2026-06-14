from django.urls import path
from . import views

urlpatterns = [
    # eSewa bill payment
    path("esewa/bill/initiate/", views.esewa_initiate_bill_payment_api, name="esewa_initiate_bill_payment_api"),

    # eSewa deposit payment
    path("esewa/deposit/initiate/", views.esewa_initiate_deposit_payment_api, name="esewa_initiate_deposit_payment_api"),

    # eSewa server callback
    path("esewa/callback/", views.esewa_callback_api, name="esewa_callback_api"),

    # eSewa manual/status verification
    path("esewa/status/", views.esewa_status_api, name="esewa_status_api"),

    # ConnectIPS routes
    path("connectips/initiate/", views.connectips_initiate_api, name="connectips_initiate_api"),
    path("connectips/validate/",views.connectips_validate_api,name="connectips_validate_api"),
    #Esewa
    path("esewa/epay/verify/", views.esewa_epay_verify_api, name="esewa_epay_verify_api"),
    path("esewa/appointment/initiate/", views.esewa_initiate_appointment_payment_api, name="esewa_initiate_appointment_payment_api",
),

]
