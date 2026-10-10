
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      status: "error",
      message: "Token autentikasi diperlukan.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      status: "error",
      message: "Token autentikasi diperlukan.",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      status: "error",
      message: "Konfigurasi autentikasi server belum tersedia.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "sersa-api",
    });

    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.tenantId !== "string" ||
      typeof decoded.role !== "string"
    ) {
      return res.status(401).json({
        status: "error",
        message: "Token autentikasi tidak valid.",
      });
    }

    req.user = {
      id: decoded.sub,
      tenantId: decoded.tenantId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      status: "error",
      message: "Token tidak valid atau sudah kedaluwarsa.",
    });
  }
}


function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Autentikasi diperlukan.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "error",
        message: "Kamu tidak memiliki izin untuk mengakses fitur ini.",
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
};

