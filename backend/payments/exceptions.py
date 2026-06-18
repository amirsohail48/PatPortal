class GatewayError(Exception):
    """
    Raised by payment gateway functions when the upstream service returns an
    error. The message is always safe to show directly to the end user.
    """
