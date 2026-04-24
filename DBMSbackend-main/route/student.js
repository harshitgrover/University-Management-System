const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const { User, Course, TakenCourse, Timetable, Announcement, Fee, Job, JobApplication } = require("../db/index");
const authenticateJWT = require("../middleware/auth");
const isStudent = require("../middleware/student");
require("dotenv").config();

const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_RESUME_MODEL = process.env.OLLAMA_RESUME_MODEL || "llama3.2:3b";

function isDuplicateKeyError(err) {
  return err?.code === 11000;
}

function ensureArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function normalizeResumeBullet(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function filterPlaceholderBullets(values = []) {
  const disallowedPatterns = [
    /^student description$/i,
    /^academic internships? & projects?$/i,
    /^internships? & projects?$/i,
    /^projects?$/i,
    /^experience$/i,
    /^n\/a$/i,
    /^not provided$/i
  ];

  return ensureArray(values)
    .map(normalizeResumeBullet)
    .filter((value) => !disallowedPatterns.some((pattern) => pattern.test(value)));
}

function containsUnsupportedBusinessMetric(value) {
  return /\b(revenue|roas|marketing budget|enterprise-level accounts?|enterprise accounts?|fiscal quarter|sales strategy|\$\d)/i.test(value);
}

function buildCourseworkLines(academicHistory = []) {
  return academicHistory
    .filter((item) => item.course_code && item.course_name)
    .map((item) => `${item.course_code} - ${item.course_name}${item.grade ? ` | Grade: ${item.grade}` : ""}${item.marks !== null ? ` | Marks: ${item.marks}` : ""}`);
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function normalizeResumeStyle(value) {
  const supportedStyles = new Set(["classic", "modern", "compact"]);
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return supportedStyles.has(normalized) ? normalized : "modern";
}

function buildManualExperienceLines(projects = []) {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects
    .map((project) => {
      if (typeof project === "string") {
        return project.trim();
      }

      if (!project || typeof project !== "object") {
        return "";
      }

      const name = typeof project.name === "string" ? project.name.trim() : "";
      const description = typeof project.description === "string" ? project.description.trim() : "";

      if (name && description) {
        return `${name}: ${description}`;
      }

      return name || description;
    })
    .filter(Boolean);
}

function sanitizeResumeData(aiResumeData, profilePayload) {
  const fallbackCoursework = buildCourseworkLines(profilePayload.academic_history);
  const manualExperience = buildManualExperienceLines(profilePayload.manual_projects);
  const manualSkills = ensureArray(profilePayload.manual_skills);
  const aiExperience = filterPlaceholderBullets(aiResumeData?.experience);
  const aiAchievements = filterPlaceholderBullets(aiResumeData?.achievements)
    .filter((value) => !containsUnsupportedBusinessMetric(value));
  const targetRole = profilePayload.student.target_role || "internship and entry-level software roles";

  return {
    summary: typeof aiResumeData?.summary === "string" && aiResumeData.summary.trim()
      ? aiResumeData.summary.trim()
      : `Student preparing for ${targetRole} with coursework, academic projects, and emerging technical experience.`,
    skills: Array.from(new Set([...ensureArray(aiResumeData?.skills), ...manualSkills])),
    experience: manualExperience.length > 0
      ? Array.from(new Set([...manualExperience, ...aiExperience]))
      : [],
    achievements: aiAchievements,
    coursework: ensureArray(aiResumeData?.coursework).length > 0
      ? ensureArray(aiResumeData.coursework)
      : fallbackCoursework
  };
}

function extractJsonTextFromResponse(response) {
  if (response?.output_text) {
    return response.output_text;
  }

  const textChunks = [];
  for (const outputItem of response?.output || []) {
    for (const contentItem of outputItem?.content || []) {
      if (typeof contentItem?.text === "string") {
        textChunks.push(contentItem.text);
      }
    }
  }

  return textChunks.join("\n").trim();
}

async function generateResumeDataWithAI(profilePayload) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      skills: {
        type: "array",
        items: { type: "string" }
      },
      experience: {
        type: "array",
        items: { type: "string" }
      },
      achievements: {
        type: "array",
        items: { type: "string" }
      },
      coursework: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["summary", "skills", "experience", "achievements", "coursework"]
  };

  const systemPrompt = "You are an expert resume writer for university students. Turn the provided student profile into a truthful, polished one-page resume draft. Do not invent companies, internships, metrics, awards, technologies, or quantified business outcomes that are not supported by the input. Improve phrasing, group related information, and keep bullet points concise and recruiter-friendly.";
  const userPrompt = `Create resume content from this JSON:\n${JSON.stringify(profilePayload, null, 2)}\n\nRules:\n- Write a 2-3 sentence professional summary tailored to the target role when provided.\n- Extract technical skills only if supported by coursework, marks, or the student's own description.\n- Use the free-text description only for the summary and highlights unless manual_projects are provided.\n- Only add PROJECTS AND EXPERIENCE bullets when there are actual manual_projects in the input.\n- Never output placeholder bullets such as "Student Description", "Projects", or "Academic Internships & Projects".\n- Never invent revenue, budgets, enterprise deals, percentages, internships, or business achievements.\n- Put course-based strengths into achievements when useful.\n- Keep everything factual and concise.\n- Return only JSON matching the schema.`;

  let response;
  try {
    response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_RESUME_MODEL,
        stream: false,
        format: schema,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    });
  } catch (err) {
    const connectionError = new Error("Ollama is not reachable");
    connectionError.statusCode = 503;
    connectionError.cause = err;
    throw connectionError;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    const apiError = new Error(`Ollama request failed: ${errorBody || response.statusText}`);
    apiError.statusCode = 502;
    throw apiError;
  }

  const responsePayload = await response.json();
  const responseText = responsePayload?.message?.content || extractJsonTextFromResponse(responsePayload);
  if (!responseText) {
    throw new Error("Ollama resume generation returned an empty response");
  }

  return sanitizeResumeData(JSON.parse(responseText), profilePayload);
}

function addSectionHeading(doc, title) {
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(12.5).text(title);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10.5);
}

function addBulletList(doc, items) {
  items.forEach((item) => {
    doc.text(`• ${item}`, {
      align: "left",
      lineGap: 2
    });
  });
}

function writeDivider(doc, color = "#D9E2EC") {
  const currentY = doc.y;
  doc.save()
    .strokeColor(color)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, currentY)
    .lineTo(doc.page.width - doc.page.margins.right, currentY)
    .stroke()
    .restore();
  doc.moveDown(0.4);
}

function writeResumePdf(doc, resumeData, profile, options = {}) {
  const style = normalizeResumeStyle(options.resume_style);
  const paletteByStyle = {
    classic: { accent: "#1F3C88", soft: "#E8EEF9", text: "#102A43" },
    modern: { accent: "#0F766E", soft: "#E6FFFA", text: "#16324F" },
    compact: { accent: "#7C2D12", soft: "#FFF1E6", text: "#3C2415" }
  };
  const palette = paletteByStyle[style];

  doc.info.Title = `${profile.first_name} ${profile.last_name} Resume`;
  doc.rect(0, 0, doc.page.width, 122).fill(palette.accent);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(style === "compact" ? 22 : 24)
    .text(`${profile.first_name} ${profile.last_name}`, 42, 34, { align: "left" });
  doc.font("Helvetica").fontSize(11)
    .text(`${profile.email} | Roll No: ${profile.roll_no || "N/A"}`, 42, 70, { align: "left" });

  if (options.target_role) {
    doc.font("Helvetica-Oblique").fontSize(10.5)
      .text(`Target Role: ${options.target_role}`, 42, 90, { align: "left" });
  }

  doc.fillColor(palette.text);
  doc.y = 138;

  addSectionHeading(doc, "PROFESSIONAL SUMMARY");
  doc.font("Helvetica").fontSize(10.8).text(resumeData.summary, { lineGap: 3 });
  writeDivider(doc, palette.soft);

  addSectionHeading(doc, "EDUCATION");
  doc.font("Helvetica-Bold").fontSize(11.2).text("Academic Portal Student");
  doc.font("Helvetica").fontSize(10.5).text(`Roll Number: ${profile.roll_no || "N/A"}`);
  doc.text("Coursework and academic performance curated for recruiter-ready presentation.");
  writeDivider(doc, palette.soft);

  if (resumeData.skills.length > 0) {
    addSectionHeading(doc, "TECHNICAL SKILLS");
    doc.font("Helvetica").fontSize(10.5).text(resumeData.skills.join(" | "), { lineGap: 2 });
    writeDivider(doc, palette.soft);
  }

  if (resumeData.experience.length > 0) {
    addSectionHeading(doc, "PROJECTS AND EXPERIENCE");
    addBulletList(doc, resumeData.experience);
    writeDivider(doc, palette.soft);
  }

  if (resumeData.achievements.length > 0) {
    addSectionHeading(doc, "HIGHLIGHTS");
    addBulletList(doc, resumeData.achievements);
    writeDivider(doc, palette.soft);
  }

  if (resumeData.coursework.length > 0) {
    addSectionHeading(doc, "RELEVANT COURSEWORK");
    addBulletList(doc, resumeData.coursework);
    writeDivider(doc, palette.soft);
  }

}

router.post("/signin", async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);
    const student = await User.findOne({ email, role: "student" });
    if (!student) return res.status(404).json({ message: "Student not found" });

    const valid = await bcrypt.compare(password, student.password);
    if (!valid) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: student._id, email: student.email, role: student.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Signin failed", error: err.message });
  }
});

router.post("/register-course/:courseId", authenticateJWT, isStudent, async (req, res) => {
  const studentId = req.user.id;
  const courseId = req.params.courseId;

  try {
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const existing = await TakenCourse.findOne({ student: studentId, course: courseId });
    if (existing) return res.status(400).json({ message: "Already registered in this course" });

    const taken = new TakenCourse({ student: studentId, course: courseId });
    await taken.save();

    res.status(201).json({ message: "Course registered", takenCourse: taken });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: "Already registered in this course" });
    }
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

router.get("/me", authenticateJWT, isStudent, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).select("-password");
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: "Failed to load profile", error: err.message });
  }
});

router.get("/my-courses", authenticateJWT, isStudent, async (req, res) => {
  try {
    const taken = await TakenCourse.find({ student: req.user.id })
      .populate({
        path: "course",
        populate: { path: "professor", select: "first_name last_name email employee_id department" }
      });
    res.json(taken);
  } catch (err) {
    res.status(500).json({ message: "Failed to load registered courses", error: err.message });
  }
});

router.get("/available-courses", authenticateJWT, isStudent, async (req, res) => {
  try {
    const taken = await TakenCourse.find({ student: req.user.id }).select("course");
    const takenCourseIds = taken.map((item) => item.course);

    const courses = await Course.find({ _id: { $nin: takenCourseIds } })
      .populate("professor", "first_name last_name email employee_id department")
      .sort({ course_code: 1 });

    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: "Failed to load available courses", error: err.message });
  }
});

router.get("/available-jobs", authenticateJWT, isStudent, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).select("department year");
    if (!student) return res.status(404).json({ message: "Student not found" });

    const applied = await JobApplication.find({ student: req.user.id }).select("job");
    const appliedJobIds = applied.map((item) => item.job);

    if (student.year == null) {
      return res.json([]);
    }

    const query = {
      open: true,
      allowed_branches: student.department,
      allowed_years: student.year
    };

    const jobs = await Job.find({
      ...query,
      _id: { $nin: appliedJobIds }
    }).sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: "Failed to load available jobs", error: err.message });
  }
});

router.post("/jobs/:jobId/apply", authenticateJWT, isStudent, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).select("department year");
    if (!student) return res.status(404).json({ message: "Student not found" });

    const job = await Job.findOne({ _id: req.params.jobId, open: true });
    if (!job) return res.status(404).json({ message: "Job not found or no longer open" });

    if (!job.allowed_branches.includes(student.department)) {
      return res.status(403).json({ message: "This job is not open for your branch" });
    }
    if (student.year == null) {
      return res.status(403).json({ message: "Student year is required to apply for jobs" });
    }
    if (!job.allowed_years.includes(student.year)) {
      return res.status(403).json({ message: "This job is not open for your year" });
    }

    const application = new JobApplication({
      student: req.user.id,
      job: job._id
    });
    await application.save();

    res.status(201).json({ message: "Application submitted", application });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ message: "You have already applied for this job" });
    }
    res.status(500).json({ message: "Failed to submit application", error: err.message });
  }
});

router.get("/applications", authenticateJWT, isStudent, async (req, res) => {
  try {
    const applications = await JobApplication.find({ student: req.user.id })
      .populate({
        path: "job",
        select: "title company description allowed_branches allowed_years open"
      })
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (err) {
    res.status(500).json({ message: "Failed to load job applications", error: err.message });
  }
});

router.patch("/applications/:applicationId/accept", authenticateJWT, isStudent, async (req, res) => {
  try {
    const application = await JobApplication.findOne({
      _id: req.params.applicationId,
      student: req.user.id
    });
    if (!application) return res.status(404).json({ message: "Application not found" });
    if (application.status !== "offered") {
      return res.status(400).json({ message: "Only offered applications can be accepted" });
    }

    application.status = "accepted";
    await application.save();

    res.json({ message: "Job offer accepted", application });
  } catch (err) {
    res.status(500).json({ message: "Failed to accept offer", error: err.message });
  }
});

router.patch("/applications/:applicationId/place", authenticateJWT, isStudent, async (req, res) => {
  try {
    const application = await JobApplication.findOne({
      _id: req.params.applicationId,
      student: req.user.id
    });
    if (!application) return res.status(404).json({ message: "Application not found" });
    if (!["offered", "accepted"].includes(application.status)) {
      return res.status(400).json({ message: "Only offered or accepted applications can be marked as placed" });
    }

    application.status = "placed";
    await application.save();

    res.json({ message: "Placement confirmed", application });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark placement", error: err.message });
  }
});

router.get("/my-announcements", authenticateJWT, isStudent, async (req, res) => {
  try {
    const taken = await TakenCourse.find({ student: req.user.id }).select("course");
    const courseIds = taken.map((item) => item.course);

    const announcements = await Announcement.find({ course: { $in: courseIds } })
      .populate("course", "course_code course_name")
      .populate("professor", "first_name last_name email")
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: "Failed to load announcements", error: err.message });
  }
});

router.get("/my-timetable", authenticateJWT, isStudent, async (req, res) => {
  try {
    const taken = await TakenCourse.find({ student: req.user.id }).select("course");
    const courseIds = taken.map((item) => item.course);

    const timetable = await Timetable.find({ course: { $in: courseIds } })
      .populate("course", "course_code course_name")
      .sort({ day_of_week: 1, start_time: 1 });

    res.json(timetable);
  } catch (err) {
    res.status(500).json({ message: "Failed to load timetable", error: err.message });
  }
});

router.get("/my-fees", authenticateJWT, isStudent, async (req, res) => {
  try {
    const now = new Date();
    await Fee.updateMany(
      { student: req.user.id, status: "pending", due_date: { $lt: now } },
      { $set: { status: "overdue" } }
    );

    const fees = await Fee.find({ student: req.user.id })
      .sort({ due_date: 1, createdAt: -1 });

    res.json(fees);
  } catch (err) {
    res.status(500).json({ message: "Failed to load fee details", error: err.message });
  }
});

router.post("/resume", authenticateJWT, isStudent, async (req, res) => {
  try {
    const {
      description = "",
      target_role = "",
      resume_style = "modern",
      manual_skills = [],
      manual_projects = [],
      preview = false
    } = req.body;

    if (!description.trim()) {
      return res.status(400).json({ message: "Please provide details in the description box" });
    }

    const student = await User.findById(req.user.id).select("-password");
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const enrollments = await TakenCourse.find({ student: req.user.id })
      .populate({
        path: "course",
        select: "course_code course_name credits",
        populate: { path: "professor", select: "first_name last_name" }
      })
      .sort({ updatedAt: -1 });

    const profilePayload = {
      student: {
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
        roll_no: student.roll_no || "",
        target_role
      },
      academic_history: enrollments.map((item) => ({
        course_code: item.course?.course_code,
        course_name: item.course?.course_name,
        credits: item.course?.credits,
        professor: item.course?.professor
          ? `${item.course.professor.first_name} ${item.course.professor.last_name}`
          : "",
        marks: item.marks ?? null,
        grade: item.grade || ""
      })),
      student_description: description.trim(),
      manual_skills: ensureArray(manual_skills),
      manual_projects,
      resume_style: normalizeResumeStyle(resume_style)
    };

    const resumeData = await generateResumeDataWithAI(profilePayload);
    if (preview) {
      return res.json({
        message: "Resume preview generated",
        resume_style: profilePayload.resume_style,
        target_role,
        resume: resumeData
      });
    }

    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const safeName = `${student.first_name}-${student.last_name}`.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-resume.pdf"`);

    doc.pipe(res);
    writeResumePdf(doc, resumeData, student, { resume_style: profilePayload.resume_style, target_role });
    doc.end();
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const message = statusCode === 503
      ? "Resume AI is unavailable. Make sure Ollama is running locally."
      : "Failed to generate resume";

    res.status(statusCode).json({ message, error: err.message });
  }
});

router.patch("/fees/:feeId/fulfill", authenticateJWT, isStudent, async (req, res) => {
  try {
    const fee = await Fee.findOne({ _id: req.params.feeId, student: req.user.id });
    if (!fee) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    if (fee.status === "paid") {
      return res.status(400).json({ message: "Fee demand is already fulfilled" });
    }

    fee.status = "paid";
    fee.paid_at = new Date();
    fee.payment_reference = `STU-${req.user.id.slice(-6).toUpperCase()}-${Date.now()}`;
    fee.fulfilled_by = req.user.id;
    await fee.save();

    res.json({ message: "Fee demand fulfilled successfully", fee });
  } catch (err) {
    res.status(500).json({ message: "Failed to fulfill fee demand", error: err.message });
  }
});

router.get("/fees/:feeId/receipt", authenticateJWT, isStudent, async (req, res) => {
  try {
    const fee = await Fee.findOne({ _id: req.params.feeId, student: req.user.id })
      .populate("student", "first_name last_name email roll_no department");

    if (!fee) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    const doc = new PDFDocument({ margin: 50 });
    const safeYear = fee.academic_year.replace(/[^a-zA-Z0-9_-]/g, "-");
    const filename = `fee-receipt-${safeYear}-sem-${fee.semester}.pdf`;
    const receiptTitle = fee.status === "paid" ? "Academic Portal Fee Payment Receipt" : "Academic Portal Fee Demand Notice";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    doc.pipe(res);
    doc.fontSize(20).text(receiptTitle, { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Demand Number: ${fee.demand_number}`);
    doc.text(`Student Name: ${fee.student.first_name} ${fee.student.last_name}`);
    doc.text(`Student Email: ${fee.student.email}`);
    doc.text(`Roll Number: ${fee.student.roll_no || "N/A"}`);
    doc.text(`Semester: ${fee.semester}`);
    doc.text(`Academic Year: ${fee.academic_year}`);
    doc.text(`Amount Due: INR ${fee.amount.toFixed(2)}`);
    doc.text(`Due Date: ${new Date(fee.due_date).toLocaleDateString("en-IN")}`);
    doc.text(`Status: ${fee.status.toUpperCase()}`);
    if (fee.payment_reference) {
      doc.text(`Payment Reference: ${fee.payment_reference}`);
    }
    if (fee.paid_at) {
      doc.text(`Paid On: ${new Date(fee.paid_at).toLocaleDateString("en-IN")}`);
    }
    if (fee.remarks) {
      doc.text(`Remarks: ${fee.remarks}`);
    }
    doc.moveDown();
    doc.text("This document is generated by the Academic Portal for official fee demand reference.");
    doc.end();
  } catch (err) {
    res.status(500).json({ message: "Failed to generate fee receipt", error: err.message });
  }
});

module.exports = router;
