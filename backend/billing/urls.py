from django.urls import path
from . import views

urlpatterns = [
    # Show pending bill groups from tblpatbilling
    path("pending/", views.pending_bills_api, name="pending_bills_api"),

    # Optional: check one ARC amount before payment
    path("arc-amount/", views.arc_amount_api, name="arc_amount_api"),

    # Optional: create invoice manually/internal after confirmed payment
    path("invoice/create/", views.create_invoice_api, name="create_invoice_api"),

    # Optional: create deposit manually/internal after confirmed payment
    path("deposit/create/", views.create_deposit_api, name="create_deposit_api"),

    # invoices and receipts viewer
    path("documents/encounters/", views.billing_encounters_api, name="billing_encounters_api"),
    path("documents/", views.invoices_receipts_api, name="invoices_receipts_api"),
    path("documents/preview/", views.billing_document_preview_api, name="billing_document_preview_api"),
]