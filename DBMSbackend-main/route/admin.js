const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User, Course, Timetable, Fee, TakenCourse, Announcement, Job, JobApplication } = require("../db/index");
const authenticateJWT = require("../middleware/auth");
const isAdmin = require("../middleware/admin");
require("dotenv").config();

function normalizeIdentifier(value) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeDepartment(value) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
}

function sanitizeUserPayload(payload = {}) {
  const nextPayload = { ...payload };

  if ("email" in nextPayload) {
    nextPayload.email = normalizeEmail(nextPayload.email);
  }
  if ("roll_no" in nextPayload) {
    nextPayload.roll_no = normalizeIdentifier(nextPayload.roll_no);
  }
  if ("employee_id" in nextPayload) {
    nextPayload.employee_id = normalizeIdentifier(nextPayload.employee_id);
  }
  if ("department" in nextPayload) {
    nextPayload.department = normalizeDepartment(nextPayload.department);
  }
  if ("year" in nextPayload) {
    const year = Number(nextPayload.year);
    nextPayload.year = Number.isInteger(year) && year >= 1 ? year : undefined;
  }

  return nextPayload;
}

function validateRoleSpecificFields(payload, role, { isUpdate = false } = {}) {
  if (role === "student") {
    if (!payload.department) {
      return "department is required for students";
    }
    if (!isUpdate && !payload.roll_no) {
      return "roll_no is required for students";
    }
    if (payload.roll_no && !payload.roll_no.startsWith(`${payload.department}-`)) {
      return "roll_no must start with the department code";
    }
    if ("employee_id" in payload && payload.employee_id) {
      return "Students cannot have employee_id";
    }
  }

  if (role === "prof") {
    if (!payload.department) {
      return "department is required for professors";
    }
    if (!isUpdate && !payload.employee_id) {
      return "employee_id is required for professors";
    }
    if (payload.employee_id && !payload.employee_id.startsWith(`${payload.department}-`)) {
      return "employee_id must start with the department code";
    }
    if ("roll_no" in payload && payload.roll_no) {
      return "Professors cannot have roll_no";
    }
  }

  if (role === "admin") {
    if ("department" in payload && payload.department) {
      return "Admins cannot have department";
    }
    if ("roll_no" in payload && payload.roll_no) {
      return "Admins cannot have roll_no";
    }
    if ("employee_id" in payload && payload.employee_id) {
      return "Admins cannot have employee_id";
    }
  }

  return null;
}

function sanitizeCoursePayload(payload = {}) {
  const nextPayload = { ...payload };

  if ("course_code" in nextPayload && typeof nextPayload.course_code === "string") {
    nextPayload.course_code = nextPayload.course_code.trim().toUpperCase();
  }
  if ("department" in nextPayload) {
    nextPayload.department = normalizeDepartment(nextPayload.department);
  }

  return nextPayload;
}

function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim().toUpperCase());
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}

function normalizeYearArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 1);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 1);
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return [value];
  }
  return [];
}

function sanitizeJobPayload(payload = {}) {
  const nextPayload = { ...payload };

  if ("title" in nextPayload && typeof nextPayload.title === "string") {
    nextPayload.title = nextPayload.title.trim();
  }
  if ("company" in nextPayload && typeof nextPayload.company === "string") {
    nextPayload.company = nextPayload.company.trim();
  }
  if ("description" in nextPayload && typeof nextPayload.description === "string") {
    nextPayload.description = nextPayload.description.trim();
  }
  if ("open" in nextPayload) {
    nextPayload.open = nextPayload.open === true || nextPayload.open === 'true' || nextPayload.open === 1 || nextPayload.open === '1';
  }
  nextPayload.allowed_branches = normalizeStringArray(nextPayload.allowed_branches);
  nextPayload.allowed_years = normalizeYearArray(nextPayload.allowed_years);

  return nextPayload;
}

async function findUserConflict(payload, excludedUserId) {
  const conflictChecks = [];

  if (payload.email) {
    conflictChecks.push({ email: payload.email });
  }
  if (payload.roll_no) {
    conflictChecks.push({ roll_no: payload.roll_no });
  }
  if (payload.employee_id) {
    conflictChecks.push({ employee_id: payload.employee_id });
  }
  if (conflictChecks.length === 0) {
    return null;
  }

  const query = { $or: conflictChecks };
  if (excludedUserId) {
    query._id = { $ne: excludedUserId };
  }

  return User.findOne(query).select("email roll_no employee_id role");
}

function applyRoleFieldPolicy(payload, role) {
  const nextPayload = { ...payload };

  if (role === "student") {
    nextPayload.department = nextPayload.department || undefined;
    nextPayload.employee_id = undefined;
  }
  if (role === "prof") {
    nextPayload.department = nextPayload.department || undefined;
    nextPayload.roll_no = undefined;
  }
  if (role === "admin") {
    nextPayload.department = undefined;
    nextPayload.roll_no = undefined;
    nextPayload.employee_id = undefined;
  }

  return nextPayload;
}

function buildUserConflictMessage(conflict, payload) {
  if (!conflict) {
    return "Duplicate user data";
  }

  if (payload.email && conflict.email === payload.email) {
    return "Email already exists";
  }
  if (payload.roll_no && conflict.roll_no === payload.roll_no) {
    return "Roll number already exists";
  }
  if (payload.employee_id && conflict.employee_id === payload.employee_id) {
    return "Employee ID already exists";
  }

  return "Duplicate user data";
}

function isDuplicateKeyError(err) {
  return err?.code === 11000;
}

function buildDuplicateKeyMessage(err, fallbackMessage = "Duplicate value already exists") {
  const duplicateField = Object.keys(err?.keyPattern || err?.keyValue || {})[0];
  const labelMap = {
    email: "Email",
    roll_no: "Roll number",
    employee_id: "Employee ID",
    course_code: "Course code",
    demand_number: "Demand number",
    student: "Student",
    course: "Course"
  };

  if (!duplicateField) {
    return fallbackMessage;
  }

  return `${labelMap[duplicateField] || duplicateField} already exists`;
}

function buildDemandNumber(student, semester, academicYear) {
  const studentRef = student.roll_no || String(student._id).slice(-6).toUpperCase();
  const yearRef = academicYear.replace(/\s+/g, "").toUpperCase();
  return `FEE-${yearRef}-SEM${semester}-${studentRef}`;
}

async function deleteCourseCascade(courseId) {
  await Promise.all([
    TakenCourse.deleteMany({ course: courseId }),
    Timetable.deleteMany({ course: courseId }),
    Announcement.deleteMany({ course: courseId }),
  ]);
  await Course.findByIdAndDelete(courseId);
}

router.post("/signup", async (req, res) => {
  try {
    const { first_name, last_name, password } = req.body;
    const email = normalizeEmail(req.body.email);
    const roleFieldError = validateRoleSpecificFields(req.body, "admin");
    if (roleFieldError) {
      return res.status(400).json({ message: roleFieldError });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Admin already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const admin = new User({ first_name, last_name, email, password: hashed, role: "admin" });
    await admin.save();

    res.status(201).json({ message: "Admin registered", adminId: admin._id });
  } catch (err) {
    res.status(500).json({ message: "Signup failed", error: err.message });
  }
});

router.post("/signin", async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    const admin = await User.findOne({ email, role: "admin" });
    if (!admin) return res.status(400).json({ message: "Admin not found" });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Signin failed", error: err.message });
  }
});

router.post("/students", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { first_name, last_name, password } = req.body;
    const { email, roll_no, department, year } = sanitizeUserPayload(req.body);
    const roleFieldError = validateRoleSpecificFields({ ...req.body, email, roll_no, department, year }, "student");
    if (roleFieldError) {
      return res.status(400).json({ message: roleFieldError });
    }
    const conflict = await findUserConflict({ email, roll_no });
    if (conflict) {
      return res.status(409).json({ message: buildUserConflictMessage(conflict, { email, roll_no }) });
    }

    const hashed = await bcrypt.hash(password, 10);
    const student = new User({
      first_name,
      last_name,
      email,
      password: hashed,
      role: "student",
      department,
      roll_no,
      year
    });
    await student.save();

    res.status(201).json({ message: "Student added", student });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: buildDuplicateKeyMessage(err, "Student already exists") });
    }
    res.status(500).json({ message: "Failed to add student", error: err.message });
  }
});

router.post("/profs", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { first_name, last_name, password } = req.body;
    const { email, employee_id, department } = sanitizeUserPayload(req.body);
    const roleFieldError = validateRoleSpecificFields({ ...req.body, email, employee_id, department }, "prof");
    if (roleFieldError) {
      return res.status(400).json({ message: roleFieldError });
    }
    const conflict = await findUserConflict({ email, employee_id });
    if (conflict) {
      return res.status(409).json({ message: buildUserConflictMessage(conflict, { email, employee_id }) });
    }

    const hashed = await bcrypt.hash(password, 10);
    const prof = new User({
      first_name,
      last_name,
      email,
      password: hashed,
      role: "prof",
      department,
      employee_id
    });
    await prof.save();

    res.status(201).json({ message: "Professor added", prof });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: buildDuplicateKeyMessage(err, "Professor already exists") });
    }
    res.status(500).json({ message: "Failed to add professor", error: err.message });
  }
});

router.get("/users", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to load users", error: err.message });
  }
});

router.get("/users/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to load user", error: err.message });
  }
});

router.patch("/users/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const payload = sanitizeUserPayload(req.body);
    const existingUser = await User.findById(req.params.id).select("role department roll_no employee_id year");
    if (!existingUser) return res.status(404).json({ message: "User not found" });

    const targetRole = payload.role || existingUser.role;
    const mergedPayload = applyRoleFieldPolicy(payload, targetRole);
    const effectivePayload = {
      ...mergedPayload,
      department: mergedPayload.department ?? existingUser.department,
      roll_no: mergedPayload.roll_no ?? existingUser.roll_no,
      employee_id: mergedPayload.employee_id ?? existingUser.employee_id,
      year: mergedPayload.year ?? existingUser.year
    };

    const roleFieldError = validateRoleSpecificFields(effectivePayload, targetRole);
    if (roleFieldError) {
      return res.status(400).json({ message: roleFieldError });
    }

    if (payload.password) {
      mergedPayload.password = await bcrypt.hash(payload.password, 10);
    }
    const conflict = await findUserConflict(mergedPayload, req.params.id);
    if (conflict) {
      return res.status(409).json({ message: buildUserConflictMessage(conflict, mergedPayload) });
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      mergedPayload,
      { new: true, runValidators: true, context: "query" }
    ).select("-password");
    res.json({ message: "User updated", user: updated });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: buildDuplicateKeyMessage(err, "Duplicate user data") });
    }
    res.status(500).json({ message: "Error updating user", error: err.message });
  }
});

router.delete("/users/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ message: "Admin cannot delete their own account" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "student") {
      await Promise.all([
        TakenCourse.deleteMany({ student: user._id }),
        Fee.deleteMany({ student: user._id }),
      ]);
    }

    if (user.role === "prof") {
      const courses = await Course.find({ professor: user._id }).select("_id");
      await Promise.all(courses.map((course) => deleteCourseCascade(course._id)));
      await Announcement.deleteMany({ professor: user._id });
    }

    await user.deleteOne();

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user", error: err.message });
  }
});

router.post("/courses", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { course_code, course_name, department, credits, professor } = sanitizeCoursePayload(req.body);
    if (!department) {
      return res.status(400).json({ message: "department is required for courses" });
    }
    const prof = await User.findOne({ _id: professor, role: "prof" }).select("_id department");
    if (!prof) return res.status(400).json({ message: "Professor not found" });
    if (prof.department !== department) {
      return res.status(400).json({ message: "Course department must match professor department" });
    }

    const course = new Course({ course_code, course_name, department, credits, professor });
    await course.save();
    res.status(201).json({ message: "Course added", course });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: buildDuplicateKeyMessage(err, "Course code already exists") });
    }
    res.status(500).json({ message: "Failed to add course", error: err.message });
  }
});

router.patch("/courses/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const payload = sanitizeCoursePayload(req.body);
    const existingCourse = await Course.findById(req.params.id).select("department");
    if (!existingCourse) return res.status(404).json({ message: "Course not found" });

    if (payload.professor) {
      const prof = await User.findOne({ _id: payload.professor, role: "prof" }).select("_id department");
      if (!prof) return res.status(400).json({ message: "Professor not found" });
      if ((payload.department || existingCourse.department) !== prof.department) {
        return res.status(400).json({ message: "Course department must match professor department" });
      }
    } else if (payload.department && payload.department !== existingCourse.department) {
      const currentCourse = await Course.findById(req.params.id).select("professor");
      const prof = await User.findOne({ _id: currentCourse.professor, role: "prof" }).select("department");
      if (prof && prof.department !== payload.department) {
        return res.status(400).json({ message: "Course department must match professor department" });
      }
    }

    const updated = await Course.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true, context: "query" }
    );
    res.json({ message: "Course updated", course: updated });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: buildDuplicateKeyMessage(err, "Course code already exists") });
    }
    res.status(500).json({ message: "Error updating course", error: err.message });
  }
});

router.get("/courses", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const courses = await Course.find()
      .populate("professor", "first_name last_name email employee_id department")
      .sort({ course_code: 1 });

    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: "Failed to load courses", error: err.message });
  }
});

router.delete("/courses/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    await deleteCourseCascade(course._id);

    res.json({ message: "Course deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete course", error: err.message });
  }
});

router.post("/jobs", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const payload = sanitizeJobPayload(req.body);
    if (!payload.title) {
      return res.status(400).json({ message: "Job title is required" });
    }
    if (!payload.company) {
      return res.status(400).json({ message: "Company name is required" });
    }
    if (!payload.description) {
      return res.status(400).json({ message: "Job description is required" });
    }
    if (payload.allowed_branches.length === 0) {
      return res.status(400).json({ message: "At least one allowed branch is required" });
    }
    if (payload.allowed_years.length === 0) {
      return res.status(400).json({ message: "At least one allowed year is required" });
    }

    const job = new Job({
      title: payload.title,
      company: payload.company,
      description: payload.description,
      allowed_branches: payload.allowed_branches,
      allowed_years: payload.allowed_years,
      open: payload.open !== false,
      created_by: req.user.id
    });
    await job.save();

    res.status(201).json({ message: "Job created", job });
  } catch (err) {
    res.status(500).json({ message: "Failed to create job", error: err.message });
  }
});

router.get("/jobs", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const jobs = await Job.find()
      .populate("created_by", "first_name last_name email")
      .sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to load jobs", error: err.message });
  }
});

router.patch("/jobs/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const payload = sanitizeJobPayload(req.body);
    if (payload.allowed_branches && payload.allowed_branches.length === 0) {
      return res.status(400).json({ message: "At least one allowed branch is required" });
    }
    if (payload.allowed_years && payload.allowed_years.length === 0) {
      return res.status(400).json({ message: "At least one allowed year is required" });
    }

    const updated = await Job.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
      context: "query"
    });
    if (!updated) return res.status(404).json({ message: "Job not found" });

    res.json({ message: "Job updated", job: updated });
  } catch (err) {
    res.status(500).json({ message: "Error updating job", error: err.message });
  }
});

router.get("/jobs/:id/applications", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const applications = await JobApplication.find({ job: job._id })
      .populate("student", "first_name last_name email roll_no department year")
      .sort({ createdAt: -1 });

    res.json({ job, applications });
  } catch (err) {
    res.status(500).json({ message: "Failed to load job applications", error: err.message });
  }
});

router.patch("/jobs/:jobId/applications/:applicationId/status", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["offered", "rejected", "placed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status update" });
    }

    const application = await JobApplication.findOne({
      _id: req.params.applicationId,
      job: req.params.jobId
    });
    if (!application) return res.status(404).json({ message: "Application not found" });

    if (application.status === "placed") {
      return res.status(400).json({ message: "Cannot change status after placement" });
    }
    if (status === "offered" && application.status !== "applied") {
      return res.status(400).json({ message: "Only applied applications can be offered" });
    }

    application.status = status;
    await application.save();

    res.json({ message: "Application status updated", application });
  } catch (err) {
    res.status(500).json({ message: "Failed to update application status", error: err.message });
  }
});

router.post("/timetable", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { course, day_of_week, start_time, end_time, room_no } = req.body;
    const existingCourse = await Course.findById(course);
    if (!existingCourse) return res.status(404).json({ message: "Course not found" });

    const timetable = new Timetable({ course, day_of_week, start_time, end_time, room_no });
    await timetable.save();
    res.status(201).json({ message: "Timetable created", timetable });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: "Timetable entry already exists for this course, day and start time" });
    }
    res.status(500).json({ message: "Failed to create timetable", error: err.message });
  }
});

router.patch("/timetable/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    if (req.body.course) {
      const existingCourse = await Course.findById(req.body.course);
      if (!existingCourse) return res.status(404).json({ message: "Course not found" });
    }

    const updated = await Timetable.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true, context: "query" }
    );
    if (!updated) return res.status(404).json({ message: "Timetable not found" });
    res.json({ message: "Timetable updated", timetable: updated });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: "Timetable entry already exists for this course, day and start time" });
    }
    res.status(500).json({ message: "Error updating timetable", error: err.message });
  }
});

router.get("/timetable", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const timetable = await Timetable.find()
      .populate({
        path: "course",
        select: "course_code course_name professor",
        populate: { path: "professor", select: "first_name last_name" }
      })
      .sort({ day_of_week: 1, start_time: 1 });

    res.json(timetable);
  } catch (err) {
    res.status(500).json({ message: "Failed to load timetable", error: err.message });
  }
});

router.delete("/timetable/:id", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const deleted = await Timetable.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Timetable not found" });

    res.json({ message: "Timetable deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete timetable", error: err.message });
  }
});

router.post("/fees/generate", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const { semester, academic_year, amount, due_date, remarks } = req.body;

    if (!semester || !academic_year || amount === undefined || !due_date) {
      return res.status(400).json({ message: "semester, academic_year, amount and due_date are required" });
    }

    const students = await User.find({ role: "student" }).select("_id roll_no first_name last_name");
    if (students.length === 0) {
      return res.status(404).json({ message: "No students found" });
    }

    const existingFees = await Fee.find({
      student: { $in: students.map((student) => student._id) },
      semester,
      academic_year
    }).select("student");

    const existingStudentIds = new Set(existingFees.map((fee) => String(fee.student)));
    const newFees = students
      .filter((student) => !existingStudentIds.has(String(student._id)))
      .map((student) => ({
        student: student._id,
        semester,
        academic_year,
        amount,
        due_date,
        remarks,
        generated_by: req.user.id,
        demand_number: buildDemandNumber(student, semester, academic_year)
      }));

    if (newFees.length === 0) {
      return res.json({ message: "Fee demand already exists for all students in this semester", createdCount: 0 });
    }

    await Fee.insertMany(newFees, { ordered: false });

    res.status(201).json({
      message: `Fee demand generated for ${newFees.length} students`,
      createdCount: newFees.length,
      skippedCount: students.length - newFees.length
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: buildDuplicateKeyMessage(err, "Fee demand already exists") });
    }
    res.status(500).json({ message: "Failed to generate fee demand", error: err.message });
  }
});

router.get("/fees", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const fees = await Fee.find()
      .populate("student", "first_name last_name email roll_no department")
      .sort({ createdAt: -1 });

    res.json(fees);
  } catch (err) {
    res.status(500).json({ message: "Failed to load fee records", error: err.message });
  }
});

router.patch("/fees/:feeId/fulfill", authenticateJWT, isAdmin, async (req, res) => {
  try {
    const paymentReference = req.body.payment_reference?.trim() || `ADMIN-${Date.now()}`;
    const fee = await Fee.findById(req.params.feeId);

    if (!fee) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    if (fee.status === "paid") {
      return res.status(400).json({ message: "Fee demand is already fulfilled" });
    }

    fee.status = "paid";
    fee.paid_at = new Date();
    fee.payment_reference = paymentReference;
    fee.fulfilled_by = req.user.id;
    await fee.save();

    res.json({ message: "Fee demand fulfilled", fee });
  } catch (err) {
    res.status(500).json({ message: "Failed to fulfill fee demand", error: err.message });
  }
});

module.exports = router;
