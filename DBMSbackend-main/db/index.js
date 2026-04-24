const mongoose = require('mongoose');

const RBAC_PERMISSIONS = {
    student: ['course.read', 'taken_course.read', 'announcement.read'],
    prof: ['course.read', 'course.update', 'taken_course.read', 'taken_course.grade', 'announcement.create', 'announcement.read', 'announcement.update'],
    admin: ['*']
};

function normalizeOptionalIdentifier(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const normalized = value.trim().toUpperCase();
    return normalized || undefined;
}

function normalizeDepartment(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const normalized = value.trim().toUpperCase();
    return normalized || undefined;
}

const UserSchema = new mongoose.Schema({
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'prof', 'admin'], required: true },
    permissions: [{ type: String, trim: true }],
    department: { type: String, trim: true, uppercase: true, set: normalizeDepartment },
    year: { type: Number, min: 1, max: 6 },

    // Optional role-specific fields
    roll_no: { type: String, set: normalizeOptionalIdentifier },
    employee_id: { type: String, set: normalizeOptionalIdentifier }
}, { timestamps: true });

UserSchema.index(
    { roll_no: 1 },
    { unique: true, partialFilterExpression: { roll_no: { $exists: true, $type: 'string' } } }
);
UserSchema.index(
    { employee_id: 1 },
    { unique: true, partialFilterExpression: { employee_id: { $exists: true, $type: 'string' } } }
);

UserSchema.pre('validate', function setDefaultPermissions(next) {
    if (!this.permissions || this.permissions.length === 0) {
        this.permissions = RBAC_PERMISSIONS[this.role] || [];
    }

    if (this.role === 'student') {
        this.employee_id = undefined;
        if (!this.department) {
            this.invalidate('department', 'Department is required for students');
        }
        if (!this.roll_no) {
            this.invalidate('roll_no', 'Roll number is required for students');
        } else if (this.department && !this.roll_no.startsWith(`${this.department}-`)) {
            this.invalidate('roll_no', 'Roll number must start with the department code');
        }
    }

    if (this.role === 'prof') {
        this.roll_no = undefined;
        if (!this.department) {
            this.invalidate('department', 'Department is required for professors');
        }
        if (!this.employee_id) {
            this.invalidate('employee_id', 'Employee ID is required for professors');
        } else if (this.department && !this.employee_id.startsWith(`${this.department}-`)) {
            this.invalidate('employee_id', 'Employee ID must start with the department code');
        }
    }

    if (this.role === 'admin') {
        this.department = undefined;
        this.roll_no = undefined;
        this.employee_id = undefined;
    }

    next();
});

const CourseSchema = new mongoose.Schema({
    course_code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    course_name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true, uppercase: true, set: normalizeDepartment },
    credits: { type: Number, required: true, min: 1 },
    professor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const TakenCourseSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    grade: { type: String, trim: true },
    marks: { type: Number, min: 0, max: 100 }
}, { timestamps: true });
TakenCourseSchema.index({ student: 1, course: 1 }, { unique: true });

const TimetableSchema = new mongoose.Schema({
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    day_of_week: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        required: true
    },
    start_time: { type: String, required: true, trim: true },
    end_time: { type: String, required: true, trim: true },
    room_no: { type: String, trim: true }
}, { timestamps: true });
TimetableSchema.index({ course: 1, day_of_week: 1, start_time: 1 }, { unique: true });

const AnnouncementSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    professor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const FeeSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    semester: { type: Number, required: true, min: 1 },
    academic_year: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    due_date: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
    demand_number: { type: String, required: true, unique: true, trim: true },
    remarks: { type: String, trim: true },
    generated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paid_at: { type: Date },
    payment_reference: { type: String, trim: true },
    fulfilled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
FeeSchema.index({ student: 1, semester: 1, academic_year: 1 }, { unique: true });

const JobSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    allowed_branches: [{ type: String, trim: true, uppercase: true }],
    allowed_years: [{ type: Number, min: 1 }],
    open: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const JobApplicationSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    status: { type: String, enum: ['applied', 'offered', 'accepted', 'rejected', 'placed'], default: 'applied' },
    applied_at: { type: Date, default: Date.now }
}, { timestamps: true });
JobApplicationSchema.index({ student: 1, job: 1 }, { unique: true });

const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);
const TakenCourse = mongoose.model('TakenCourse', TakenCourseSchema);
const Timetable = mongoose.model('Timetable', TimetableSchema);
const Announcement = mongoose.model('Announcement', AnnouncementSchema);
const Fee = mongoose.model('Fee', FeeSchema);
const Job = mongoose.model('Job', JobSchema);
const JobApplication = mongoose.model('JobApplication', JobApplicationSchema);

module.exports = {
    User,
    Course,
    TakenCourse,
    Timetable,
    Announcement,
    Fee,
    Job,
    JobApplication,
    RBAC_PERMISSIONS
};
