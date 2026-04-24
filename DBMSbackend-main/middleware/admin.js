const { User } = require("../db/index");

async function isAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user.id).select("role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    req.currentUser = user;
    next();
  } catch (err) {
    console.error("isAdmin middleware error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

module.exports = isAdmin;
