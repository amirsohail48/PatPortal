from django.db import models


class OnlineBooking(models.Model):
    booking_id = models.CharField(max_length=100, unique=True)
    patient_id = models.CharField(max_length=100, db_index=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    consult_date = models.DateField(null=True, blank=True)
    department = models.CharField(max_length=200, blank=True)
    group = models.CharField(max_length=200, blank=True)
    scheme = models.CharField(max_length=200, blank=True)
    consultant = models.CharField(max_length=200, blank=True)
    item_name = models.CharField(max_length=300, blank=True)
    item_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    queue_number = models.IntegerField(null=True, blank=True)
    expected_time = models.CharField(max_length=10, blank=True)
    state = models.CharField(max_length=50, default="Booked")
    billing_mode = models.CharField(max_length=50, blank=True)
    payment_reference = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["consult_date", "queue_number"]

    def __str__(self):
        return f"{self.booking_id} — {self.patient_id} — {self.consult_date}"
