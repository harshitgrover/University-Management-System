const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { User, Course, TakenCourse, Announcement } = require("../db/index");
const authenticateJWT = require("../middleware/auth");
const isProf = require("../middleware/prof");
require("dotenv").config();

function normalizeEmail(value) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

router.post("/signin", async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    const prof = await User.findOne({ email, role: "prof" });
    if (!prof) return res.status(404).json({ message: "Professor not found" });

    const valid = await bcrypt.compare(password, prof.password);
    if (!valid) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: prof._id, email: prof.email, role: prof.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Signin failed", error: err.message });
  }
});

router.get("/students", authenticateJWT, isProf, async (req, res) => {
  try {
    const courses = await Course.find({ professor: req.user.id }).select("_id");
    const courseIds = courses.map((item) => item._id);

    const enrollments = await TakenCourse.find({ course: { $in: courseIds } })
      .populate("student", "first_name last_name email roll_no department")
      .populate("course", "course_code course_name department");

    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ message: "Failed to load students", error: err.message });
  }
});

router.get("/courses", authenticateJWT, isProf, async (req, res) => {
  try {
    const courses = await Course.find({ professor: req.user.id })
      .sort({ course_code: 1 });

    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: "Failed to load courses", error: err.message });
  }
});

router.patch("/marks", authenticateJWT, isProf, async (req, res) => {
  try {
    const { studentId, courseId, marks, grade } = req.body;
    const course = await Course.findOne({ _id: courseId, professor: req.user.id });
    if (!course) return res.status(403).json({ message: "You do not teach this course" });

    const updated = await TakenCourse.findOneAndUpdate(
      { student: studentId, course: courseId },
      { marks, grade },
      { new: true }
    )
      .populate("student", "first_name last_name email roll_no department")
      .populate("course", "course_code course_name department");

    if (!updated) return res.status(404).json({ message: "Enrollment not found" });
    res.json({ message: "Marks updated", enrollment: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update marks", error: err.message });
  }
});

router.post("/announcements", authenticateJWT, isProf, async (req, res) => {
  try {
    const { courseId, title, message } = req.body;
    const course = await Course.findOne({ _id: courseId, professor: req.user.id });
    if (!course) return res.status(403).json({ message: "You do not teach this course" });

    const announcement = new Announcement({
      title,
      message,
      course: courseId,
      professor: req.user.id
    });
    await announcement.save();

    res.status(201).json({ message: "Announcement created", announcement });
  } catch (err) {
    res.status(500).json({ message: "Failed to create announcement", error: err.message });
  }
});

module.exports = router;
