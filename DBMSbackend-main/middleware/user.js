const { User } = require("../db/index");

async function isUser(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user.id).select("role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Old file name kept for compatibility; maps to student role.
    if (user.role !== "student") {
      return res.status(403).json({ message: "Access denied: Students only" });
    }

    req.currentUser = user;
    next();
  } catch (err) {
    console.error("isUser middleware error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

module.exports = isUser;
