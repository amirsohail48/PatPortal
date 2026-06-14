from django.db import models


class EsewaPaymentTransaction(models.Model):
    PAYMENT_TYPE_CHOICES = [
        ("BILL", "Bill Payment"),
        ("DEPOSIT", "Deposit"),
        ("APPOINTMENT", "Appointment"),
    ]

    STATUS_CHOICES = [
        ("INITIATED", "Initiated"),
        ("BOOKED", "Booked"),
        ("PENDING", "Pending"),
        ("SUCCESS", "Success"),
        ("FAILED", "Failed"),
        ("CANCELED", "Canceled"),
        ("REVERTED", "Reverted"),
        ("INVOICE_CREATED", "Invoice Created"),
        ("DEPOSIT_CREATED", "Deposit Created"),
    ]

    patient_id = models.CharField(max_length=150)
    encounter_id = models.CharField(max_length=150)

    payment_type = models.CharField(max_length=20, choices=PAYMENT_TYPE_CHOICES)

    # For bill payment only
    arc_code = models.CharField(max_length=250, blank=True, null=True)

    amount = models.DecimalField(max_digits=16, decimal_places=4)

    transaction_uuid = models.CharField(max_length=150, unique=True)
    booking_id = models.CharField(max_length=250, blank=True, null=True)
    correlation_id = models.CharField(max_length=250, blank=True, null=True)
    deeplink = models.TextField(blank=True, null=True)

    esewa_status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="INITIATED")
    reference_code = models.CharField(max_length=150, blank=True, null=True)

    healthybit_invoice_no = models.CharField(max_length=150, blank=True, null=True)
    healthybit_deposit_no = models.CharField(max_length=150, blank=True, null=True)

    raw_request = models.JSONField(blank=True, null=True)
    raw_response = models.JSONField(blank=True, null=True)
    callback_payload = models.JSONField(blank=True, null=True)

    error_message = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ConnectIPSPaymentTransaction(models.Model):
    STATUS_CHOICES = [
        ("INITIATED", "Initiated"),
        ("SUCCESS", "Success"),
        ("FAILED", "Failed"),
        ("ERROR", "Error"),
        ("INCOMPLETE", "Incomplete"),
    ]

    payment_type = models.CharField(max_length=50, blank=True, null=True)
    patient_id = models.CharField(max_length=150)

    txn_id = models.CharField(max_length=20, unique=True)
    reference_id = models.CharField(max_length=20)

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_paisa = models.IntegerField()

    remarks = models.CharField(max_length=50, blank=True, null=True)
    particulars = models.CharField(max_length=100, blank=True, null=True)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="INITIATED")
    connectips_status = models.CharField(max_length=50, blank=True, null=True)
    status_desc = models.CharField(max_length=255, blank=True, null=True)

    nchl_txn_id = models.CharField(max_length=100, blank=True, null=True)
    batch_id = models.CharField(max_length=100, blank=True, null=True)

    request_payload = models.JSONField(blank=True, null=True)
    validation_request = models.JSONField(blank=True, null=True)
    validation_response = models.JSONField(blank=True, null=True)
    detail_response = models.JSONField(blank=True, null=True)

    is_finalized = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "connectips_payment_transaction"

    def __str__(self):
        return f"{self.txn_id} - {self.patient_id} - {self.status}"