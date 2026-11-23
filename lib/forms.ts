export type FormResult = { error?: string; success?: string };

export function text(data: FormData, name: string) {
  const field = data.get(name);
  return typeof field === "string" ? field.trim() : "";
}

export function emailAddress(data: FormData) {
  return text(data, "email").toLowerCase();
}

export function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
