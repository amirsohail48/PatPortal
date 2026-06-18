export function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const cookie of cookies) {
    const parts = cookie.split("=");
    const key = decodeURIComponent(parts[0]);
    if (key === name) {
      return decodeURIComponent(parts.slice(1).join("="));
    }
  }
  return "";
}
