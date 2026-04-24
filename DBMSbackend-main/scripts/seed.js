const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const {
  User,
  Course,
  TakenCourse,
  Timetable,
  Announcement,
  Fee,
} = require("../db");

dotenv.config();

function demandNumber(rollNo, semester, academicYear) {
  return `FEE-${academicYear.replace(/\s+/g, "").toUpperCase()}-SEM${semester}-${rollNo}`;
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  await Promise.all([
    Fee.deleteMany({}),
    Announcement.deleteMany({}),
    Timetable.deleteMany({}),
    TakenCourse.deleteMany({}),
    Course.deleteMany({}),
    User.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash("password123", 10);

  const [admin] = await User.create([
    {
      first_name: "System",
      last_name: "Admin",
      email: "admin@academicportal.edu",
      password: passwordHash,
      role: "admin",
    },
  ]);

  const professors = await User.insertMany([
    {
      first_name: "Aarav",
      last_name: "Mehta",
      email: "aarav.mehta@academicportal.edu",
      password: passwordHash,
      role: "prof",
      department: "CSE",
      employee_id: "CSE-EMP1001",
    },
    {
      first_name: "Ishita",
      last_name: "Sharma",
      email: "ishita.sharma@academicportal.edu",
      password: passwordHash,
      role: "prof",
      department: "ECE",
      employee_id: "ECE-EMP1002",
    },
  ]);

  const students = await User.insertMany([
    {
      first_name: "Rohan",
      last_name: "Verma",
      email: "rohan.verma@academicportal.edu",
      password: passwordHash,
      role: "student",
      department: "CSE",
      roll_no: "CSE-STU24001",
    },
    {
      first_name: "Priya",
      last_name: "Nair",
      email: "priya.nair@academicportal.edu",
      password: passwordHash,
      role: "student",
      department: "ECE",
      roll_no: "ECE-STU24002",
    },
    {
      first_name: "Kabir",
      last_name: "Singh",
      email: "kabir.singh@academicportal.edu",
      password: passwordHash,
      role: "student",
      department: "CSE",
      roll_no: "CSE-STU24003",
    },
  ]);

  const courses = await Course.insertMany([
    {
      course_code: "CS201",
      course_name: "Database Management Systems",
      department: "CSE",
      credits: 4,
      professor: professors[0]._id,
    },
    {
      course_code: "CS202",
      course_name: "Operating Systems",
      department: "ECE",
      credits: 4,
      professor: professors[1]._id,
    },
    {
      course_code: "CS203",
      course_name: "Web Application Development",
      department: "CSE",
      credits: 3,
      professor: professors[0]._id,
    },
  ]);

  await Timetable.insertMany([
    { course: courses[0]._id, day_of_week: "Monday", start_time: "09:00", end_time: "10:30", room_no: "A-101" },
    { course: courses[0]._id, day_of_week: "Wednesday", start_time: "09:00", end_time: "10:30", room_no: "A-101" },
    { course: courses[1]._id, day_of_week: "Tuesday", start_time: "11:00", end_time: "12:30", room_no: "B-204" },
    { course: courses[1]._id, day_of_week: "Thursday", start_time: "11:00", end_time: "12:30", room_no: "B-204" },
    { course: courses[2]._id, day_of_week: "Friday", start_time: "14:00", end_time: "16:00", room_no: "Lab-3" },
  ]);

  await TakenCourse.insertMany([
    { student: students[0]._id, course: courses[0]._id, marks: 88, grade: "A" },
    { student: students[0]._id, course: courses[2]._id, marks: 91, grade: "A+" },
    { student: students[1]._id, course: courses[0]._id, marks: 82, grade: "A-" },
    { student: students[1]._id, course: courses[1]._id, marks: 79, grade: "B+" },
    { student: students[2]._id, course: courses[1]._id, marks: 85, grade: "A" },
    { student: students[2]._id, course: courses[2]._id, marks: 89, grade: "A" },
  ]);

  await Announcement.insertMany([
    {
      title: "Assignment 1 Released",
      message: "Please submit the DBMS ER diagram assignment by Friday evening.",
      course: courses[0]._id,
      professor: professors[0]._id,
    },
    {
      title: "Lab Session Update",
      message: "This week's web development lab will focus on React forms and API integration.",
      course: courses[2]._id,
      professor: professors[0]._id,
    },
    {
      title: "Quiz Reminder",
      message: "Operating Systems quiz 1 will be conducted next Tuesday in the first half of class.",
      course: courses[1]._id,
      professor: professors[1]._id,
    },
  ]);

  await Fee.insertMany([
    {
      student: students[0]._id,
      semester: 4,
      academic_year: "2025-26",
      amount: 42500,
      due_date: new Date("2026-04-15"),
      status: "pending",
      demand_number: demandNumber(students[0].roll_no, 4, "2025-26"),
      remarks: "Semester tuition and lab charges",
      generated_by: admin._id,
    },
    {
      student: students[1]._id,
      semester: 4,
      academic_year: "2025-26",
      amount: 42500,
      due_date: new Date("2026-04-15"),
      status: "paid",
      demand_number: demandNumber(students[1].roll_no, 4, "2025-26"),
      remarks: "Semester tuition and lab charges",
      generated_by: admin._id,
      paid_at: new Date("2026-04-01"),
      payment_reference: "SEED-PAY-24002",
      fulfilled_by: students[1]._id,
    },
    {
      student: students[2]._id,
      semester: 4,
      academic_year: "2025-26",
      amount: 42500,
      due_date: new Date("2026-03-20"),
      status: "overdue",
      demand_number: demandNumber(students[2].roll_no, 4, "2025-26"),
      remarks: "Semester tuition and lab charges",
      generated_by: admin._id,
    },
  ]);

  console.log("Seed complete.");
  console.log("Admin login: admin@academicportal.edu / password123");
  console.log("Professor login: aarav.mehta@academicportal.edu / password123");
  console.log("Student login: rohan.verma@academicportal.edu / password123");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
