import os
import subprocess
from decimal import Decimal


HEALTHYBIT_USER = os.getenv("HEALTHYBIT_USER", "admin")
HEALTHYBIT_PASS = os.getenv("HEALTHYBIT_PASS", "")


def run_healthybit_command(command_type, var_value):
    command = [
        "healthybit",
        command_type,
        f"--user={HEALTHYBIT_USER}",
        f"--pass={HEALTHYBIT_PASS}",
        f"--var={var_value}",
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())

    return result.stdout.strip()


def parse_healthybit_total(output):
    """
    Expected output:
    TOTAL:4315
    """

    if not output:
        raise ValueError("Empty response from healthybit")

    output = output.strip()

    if not output.startswith("TOTAL:"):
        raise ValueError(f"Unexpected healthybit response: {output}")

    amount_text = output.replace("TOTAL:", "").strip()

    try:
        return Decimal(amount_text)
    except Exception:
        raise ValueError(f"Invalid total amount from healthybit: {output}")


def check_invoice(encounter_id, arc_code):
    raw_output = run_healthybit_command(
        "--check-invoice",
        f"{encounter_id}|{arc_code}",
    )

    return parse_healthybit_total(raw_output)
    


def create_invoice(encounter_id, arc_code, amount):
    return run_healthybit_command(
        "--create-invoice",
        f"{encounter_id}|{arc_code}|{amount}",
    )


def create_deposit(encounter_id, transaction_no, amount):
    return run_healthybit_command(
        "--create-deposit",
        f"{encounter_id}|{transaction_no}|{amount}",
    )