from decimal import Decimal
from collections import OrderedDict

from legacy_hmis.models import Tblpatbilling


def decimal_to_string(value):
    if value is None:
        return "0.00"

    return str(Decimal(value).quantize(Decimal("0.01")))


def datetime_to_string(value):
    if value is None:
        return ""

    return value.strftime("%Y-%m-%d %H:%M:%S")


def get_pending_invoice_groups(encounter_id):
    """
    Fetch pending bill items from tblpatbilling and group them by fldextracol.

    Each fldextracol value represents one invoice group.
    """

    bill_items = (
        Tblpatbilling.objects
        .filter(
            fldencounterval=encounter_id,
            fldsave="0",
            fldprint="0",
            flditemqty__gt=0,
            fldbilltype="Cash",
            fldextracol__isnull=False,
        )
        .exclude(fldextracol="")
        .order_by("fldextracol", "fldtime", "fldid")
    )

    grouped_data = OrderedDict()

    for item in bill_items:
        arc_code = item.fldextracol

        if arc_code not in grouped_data:
            grouped_data[arc_code] = {
                "arc_code": arc_code,
                "amount": Decimal("0.00"),
                "items": [],
            }

        item_amount = Decimal(item.fldditemamt or 0)
        grouped_data[arc_code]["amount"] += item_amount

        grouped_data[arc_code]["items"].append({
            "fldid": item.fldid,
            "fldtime": datetime_to_string(item.fldtime),
            "flditemtype": item.flditemtype or "",
            "flditemno": item.flditemno or "",
            "flditemname": item.flditemname or "",
            "flditemrate": decimal_to_string(item.flditemrate),
            "flditemqty": decimal_to_string(item.flditemqty),
            "flddiscper": decimal_to_string(item.flddiscper),
            "fldtaxper": decimal_to_string(item.fldtaxper),
            "fldditemamt": decimal_to_string(item.fldditemamt),
            "fldtaxamt": decimal_to_string(item.fldtaxamt),
            "flddiscamt": decimal_to_string(item.flddiscamt),
            "fldbillingmode": item.fldbillingmode or "",
            "fldsample": item.fldsample or "",
            "fldbilltype": item.fldbilltype or "",
            "flddisctype": item.flddisctype or "",
            "fldacledger": item.fldacledger or "",
            "fldretqty": decimal_to_string(item.fldretqty),
            "flduserid": item.flduserid or "",
            "fldcomp": item.fldcomp or "",
            "fldpayto": item.fldpayto or "",
            "fldrefer": item.fldrefer or "",
            "fldcashincredit": item.fldcashincredit or "",
        })

    final_groups = []

    for group in grouped_data.values():
        final_groups.append({
            "arc_code": group["arc_code"],
            "amount": decimal_to_string(group["amount"]),
            "items": group["items"],
        })

    return final_groups


def get_arc_amount(encounter_id, arc_code):
    """
    Recalculate amount for one ARC group from tblpatbilling.
    This is used before payment so frontend amount is not trusted.
    """

    bill_items = Tblpatbilling.objects.filter(
        fldencounterval=encounter_id,
        fldsave="0",
        fldprint="0",
        flditemqty__gt=0,
        fldbilltype="Cash",
        fldextracol=arc_code,
    )

    total = Decimal("0.00")

    for item in bill_items:
        total += Decimal(item.fldditemamt or 0)

    if total <= 0:
        raise ValueError("No pending bill found for this ARC group")

    return total