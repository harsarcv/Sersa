
function validateBusinessRegistration(data) {
  const errors = [];

  const businessName =
    typeof data.businessName === "string"
      ? data.businessName.trim()
      : "";

  const fullName =
    typeof data.fullName === "string"
      ? data.fullName.trim()
      : "";

  const email =
    typeof data.email === "string"
      ? data.email.trim().toLowerCase()
      : "";

  const password =
    typeof data.password === "string"
      ? data.password
      : "";

  if (businessName.length < 2 || businessName.length > 150) {
    errors.push("Nama bisnis harus 2–150 karakter.");
  }

  if (fullName.length < 2 || fullName.length > 150) {
    errors.push("Nama lengkap harus 2–150 karakter.");
  }

  if (
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.push("Format email tidak valid.");
  }

  if (password.length < 8 || password.length > 72) {
    errors.push("Password harus 8–72 karakter.");
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      businessName,
      fullName,
      email,
      password,
    },
  };
}

module.exports = { validateBusinessRegistration };
