import hmac
import base64


def decode_ascii_chunk_password(value):
    """
    Converts legacy 3-digit ASCII encoded password into normal text.

    Example:
    049050051052053054 -> 123456
    """

    if not value:
        return ""

    value = str(value).strip()

    if len(value) % 3 != 0:
        # print("Password length is not divisible by 3:", value)
        return ""

    try:
        chars = []

        for index in range(0, len(value), 3):
            ascii_code = int(value[index:index + 3])
            chars.append(chr(ascii_code))

        decoded = "".join(chars)
        # print("Decoded legacy password:", decoded)

        return decoded

    except Exception as error:
        # print("Password decode error:", error)
        return ""



def decode_base64_password(value):
    """
    Example:
    MTIzNDU2 -> 123456
    """
    if not value:
        return ""

    try:
        return base64.b64decode(value).decode("utf-8")
    except Exception:
        return ""


def check_legacy_password(raw_password, encoded_password):
    """
    Compares user-entered password with legacy encoded password.
    """

    if raw_password is None or encoded_password is None:
        return False

    decoded_password = decode_ascii_chunk_password(encoded_password)

    if not decoded_password:
        return False

    return hmac.compare_digest(str(raw_password), decoded_password)

def encode_ascii_chunk_password(raw_password):
    """
    Converts normal password into legacy 3-digit ASCII encoded password.

    Example:
    123456 -> 049050051052053054
    """

    if raw_password is None:
        return ""

    raw_password = str(raw_password)

    encoded_parts = []

    for char in raw_password:
        encoded_parts.append(str(ord(char)).zfill(3))

    return "".join(encoded_parts)