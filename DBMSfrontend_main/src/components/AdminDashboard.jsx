import { useEffect, useState } from 'react';
import {
  adminCreateCourse,
  adminCreateJob,
  adminDeleteCourse,
  adminDeleteTimetable,
  adminDeleteUser,
  adminFetchFees,
  adminFetchJobs,
  adminFetchCourses,
  adminFetchTimetable,
  adminFetchUsers,
  adminFetchJobApplications,
  adminFulfillFeeDemand,
  adminCreateProf,
  adminCreateStudent,
  adminCreateTimetable,
  adminGenerateFees,
  adminUpdateApplicationStatus,
  adminUpdateCourse,
  adminUpdateTimetable,
  adminUpdateUser,
} from '../api.js';

function AdminDashboard({ onMessage }) {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [fees, setFees] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobApplications, setJobApplications] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [form, setForm] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editingTimetable, setEditingTimetable] = useState(null);
  const [busy, setBusy] = useState(false);
  const profs = users.filter((user) => user.role === 'prof');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [usersData, feesData, coursesData, timetableData, jobsData] = await Promise.all([
        adminFetchUsers(),
        adminFetchFees(),
        adminFetchCourses(),
        adminFetchTimetable(),
        adminFetchJobs(),
      ]);
      setUsers(usersData);
      setFees(feesData);
      setCourses(coursesData);
      setTimetable(timetableData);
      setJobs(jobsData);
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function handleSubmit(event, action) {
    event.preventDefault();
    setBusy(true);
    onMessage('');

    try {
      let result;
      if (action === 'student') {
        result = await adminCreateStudent({
          first_name: form.studentFirstName,
          last_name: form.studentLastName,
          email: form.studentEmail,
          password: form.studentPassword,
          roll_no: form.studentRollNo,
          year: form.studentYear,
        });
      } else if (action === 'prof') {
        result = await adminCreateProf({
          first_name: form.profFirstName,
          last_name: form.profLastName,
          email: form.profEmail,
          password: form.profPassword,
          employee_id: form.profEmployeeId,
        });
      } else if (action === 'course') {
        result = await adminCreateCourse({
          course_code: form.courseCode,
          course_name: form.courseName,
          credits: Number(form.courseCredits),
          professor: form.courseProfessorId,
        });
      } else if (action === 'job') {
        result = await adminCreateJob({
          title: form.jobTitle,
          company: form.jobCompany,
          description: form.jobDescription,
          allowed_branches: form.jobAllowedBranches,
          allowed_years: form.jobAllowedYears,
          open: form.jobOpen !== 'false',
        });
      } else if (action === 'timetable') {
        result = await adminCreateTimetable({
          course: form.timetableCourseId,
          day_of_week: form.timetableDay,
          start_time: form.timetableStart,
          end_time: form.timetableEnd,
          room_no: form.timetableRoom,
        });
      } else if (action === 'fees') {
        result = await adminGenerateFees({
          semester: Number(form.feeSemester),
          academic_year: form.feeAcademicYear,
          amount: Number(form.feeAmount),
          due_date: form.feeDueDate,
          remarks: form.feeRemarks,
        });
      }

      onMessage(result.message || 'Saved successfully');
      await loadDashboard();
      setForm({});
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFulfillFee(feeId) {
    setBusy(true);
    onMessage('');

    try {
      const result = await adminFulfillFeeDemand(feeId);
      onMessage(result.message || 'Fee fulfilled');
      await loadDashboard();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCourse(courseId) {
    setBusy(true);
    onMessage('');

    try {
      const result = await adminDeleteCourse(courseId);
      onMessage(result.message || 'Course deleted');
      await loadDashboard();
      if (editingCourse?._id === courseId) {
        setEditingCourse(null);
      }
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUser(userId) {
    setBusy(true);
    onMessage('');

    try {
      const result = await adminDeleteUser(userId);
      onMessage(result.message || 'User deleted');
      await loadDashboard();
      if (editingUser?._id === userId) {
        setEditingUser(null);
      }
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTimetable(timetableId) {
    setBusy(true);
    onMessage('');

    try {
      const result = await adminDeleteTimetable(timetableId);
      onMessage(result.message || 'Timetable deleted');
      await loadDashboard();
      if (editingTimetable?._id === timetableId) {
        setEditingTimetable(null);
      }
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadJobApplications(job) {
    setBusy(true);
    onMessage('');

    try {
      const result = await adminFetchJobApplications(job._id);
      setSelectedJob(result.job);
      setJobApplications(result.applications || []);
      onMessage('Loaded applications for the selected job');
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateApplicationStatus(jobId, applicationId, status) {
    setBusy(true);
    onMessage('');

    try {
      const result = await adminUpdateApplicationStatus(jobId, applicationId, status);
      onMessage(result.message || 'Application updated');
      if (selectedJob?._id === jobId) {
        await handleLoadJobApplications(selectedJob);
      }
      await loadDashboard();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUserUpdate(event) {
    event.preventDefault();
    if (!editingUser) return;
    setBusy(true);
    onMessage('');

    try {
      const payload = {
        first_name: editingUser.first_name,
        last_name: editingUser.last_name,
        email: editingUser.email,
        role: editingUser.role,
        roll_no: editingUser.role === 'student' ? editingUser.roll_no : undefined,
        employee_id: editingUser.role === 'prof' ? editingUser.employee_id : undefined,
        year: editingUser.role === 'student' ? editingUser.year : undefined,
      };
      const result = await adminUpdateUser(editingUser._id, payload);
      onMessage(result.message || 'User updated');
      await loadDashboard();
      setEditingUser(null);
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCourseUpdate(event) {
    event.preventDefault();
    if (!editingCourse) return;
    setBusy(true);
    onMessage('');

    try {
      const result = await adminUpdateCourse(editingCourse._id, {
        course_code: editingCourse.course_code,
        course_name: editingCourse.course_name,
        credits: Number(editingCourse.credits),
        professor: editingCourse.professor,
      });
      onMessage(result.message || 'Course updated');
      await loadDashboard();
      setEditingCourse(null);
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTimetableUpdate(event) {
    event.preventDefault();
    if (!editingTimetable) return;
    setBusy(true);
    onMessage('');

    try {
      const result = await adminUpdateTimetable(editingTimetable._id, {
        course: editingTimetable.course,
        day_of_week: editingTimetable.day_of_week,
        start_time: editingTimetable.start_time,
        end_time: editingTimetable.end_time,
        room_no: editingTimetable.room_no,
      });
      onMessage(result.message || 'Timetable updated');
      await loadDashboard();
      setEditingTimetable(null);
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <div className="card">
        <h3>Admin tools</h3>
        <form className="form-stack" onSubmit={(event) => handleSubmit(event, 'student')}>
          <h4>Add student</h4>
          <input placeholder="First name" value={form.studentFirstName || ''} onChange={(e) => setForm({ ...form, studentFirstName: e.target.value })} required />
          <input placeholder="Last name" value={form.studentLastName || ''} onChange={(e) => setForm({ ...form, studentLastName: e.target.value })} required />
          <input placeholder="Email" type="email" value={form.studentEmail || ''} onChange={(e) => setForm({ ...form, studentEmail: e.target.value })} required />
          <input placeholder="Password" type="password" value={form.studentPassword || ''} onChange={(e) => setForm({ ...form, studentPassword: e.target.value })} required />
          <input placeholder="Roll No" value={form.studentRollNo || ''} onChange={(e) => setForm({ ...form, studentRollNo: e.target.value })} />
          <input placeholder="Year" type="number" min="1" value={form.studentYear || ''} onChange={(e) => setForm({ ...form, studentYear: e.target.value })} />
          <button className="btn btn-primary" type="submit" disabled={busy}>Create student</button>
        </form>

        <form className="form-stack" onSubmit={(event) => handleSubmit(event, 'prof')}>
          <h4>Add professor</h4>
          <input placeholder="First name" value={form.profFirstName || ''} onChange={(e) => setForm({ ...form, profFirstName: e.target.value })} required />
          <input placeholder="Last name" value={form.profLastName || ''} onChange={(e) => setForm({ ...form, profLastName: e.target.value })} required />
          <input placeholder="Email" type="email" value={form.profEmail || ''} onChange={(e) => setForm({ ...form, profEmail: e.target.value })} required />
          <input placeholder="Password" type="password" value={form.profPassword || ''} onChange={(e) => setForm({ ...form, profPassword: e.target.value })} required />
          <input placeholder="Employee ID" value={form.profEmployeeId || ''} onChange={(e) => setForm({ ...form, profEmployeeId: e.target.value })} />
          <button className="btn btn-primary" type="submit" disabled={busy}>Create professor</button>
        </form>
      </div>

      <div className="card">
        <form className="form-stack" onSubmit={(event) => handleSubmit(event, 'course')}>
          <h4>Create course</h4>
          <input placeholder="Course code" value={form.courseCode || ''} onChange={(e) => setForm({ ...form, courseCode: e.target.value })} required />
          <input placeholder="Course name" value={form.courseName || ''} onChange={(e) => setForm({ ...form, courseName: e.target.value })} required />
          <input placeholder="Credits" type="number" min="1" value={form.courseCredits || ''} onChange={(e) => setForm({ ...form, courseCredits: e.target.value })} required />
          <select
            value={form.courseProfessorId || ''}
            onChange={(e) => setForm({ ...form, courseProfessorId: e.target.value })}
            required
          >
            <option value="">Select professor</option>
            {profs.map((prof) => (
              <option key={prof._id} value={prof._id}>
                {prof.first_name} {prof.last_name} ({prof.employee_id || prof.email})
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy}>Create course</button>
        </form>

        <form className="form-stack" onSubmit={(event) => handleSubmit(event, 'job')}>
          <h4>Create job posting</h4>
          <input placeholder="Job title" value={form.jobTitle || ''} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} required />
          <input placeholder="Company name" value={form.jobCompany || ''} onChange={(e) => setForm({ ...form, jobCompany: e.target.value })} required />
          <textarea placeholder="Job description" value={form.jobDescription || ''} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })} required />
          <input placeholder="Allowed branches (comma separated)" value={form.jobAllowedBranches || ''} onChange={(e) => setForm({ ...form, jobAllowedBranches: e.target.value })} required />
          <input placeholder="Allowed years (comma separated)" value={form.jobAllowedYears || ''} onChange={(e) => setForm({ ...form, jobAllowedYears: e.target.value })} required />
          <select value={form.jobOpen || 'true'} onChange={(e) => setForm({ ...form, jobOpen: e.target.value })}>
            <option value="true">Open</option>
            <option value="false">Closed</option>
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy}>Create job</button>
        </form>

        <form className="form-stack" onSubmit={(event) => handleSubmit(event, 'timetable')}>
          <h4>Create timetable entry</h4>
          <input placeholder="Course ID" value={form.timetableCourseId || ''} onChange={(e) => setForm({ ...form, timetableCourseId: e.target.value })} required />
          <input placeholder="Day of week" value={form.timetableDay || ''} onChange={(e) => setForm({ ...form, timetableDay: e.target.value })} required />
          <input placeholder="Start time" value={form.timetableStart || ''} onChange={(e) => setForm({ ...form, timetableStart: e.target.value })} required />
          <input placeholder="End time" value={form.timetableEnd || ''} onChange={(e) => setForm({ ...form, timetableEnd: e.target.value })} required />
          <input placeholder="Room no" value={form.timetableRoom || ''} onChange={(e) => setForm({ ...form, timetableRoom: e.target.value })} />
          <button className="btn btn-primary" type="submit" disabled={busy}>Create timetable</button>
        </form>

        <form className="form-stack" onSubmit={(event) => handleSubmit(event, 'fees')}>
          <h4>Generate semester fee demand</h4>
          <input placeholder="Semester" type="number" min="1" value={form.feeSemester || ''} onChange={(e) => setForm({ ...form, feeSemester: e.target.value })} required />
          <input placeholder="Academic year (e.g. 2025-26)" value={form.feeAcademicYear || ''} onChange={(e) => setForm({ ...form, feeAcademicYear: e.target.value })} required />
          <input placeholder="Amount" type="number" min="0" value={form.feeAmount || ''} onChange={(e) => setForm({ ...form, feeAmount: e.target.value })} required />
          <input type="date" value={form.feeDueDate || ''} onChange={(e) => setForm({ ...form, feeDueDate: e.target.value })} required />
          <textarea placeholder="Remarks" value={form.feeRemarks || ''} onChange={(e) => setForm({ ...form, feeRemarks: e.target.value })} />
          <button className="btn btn-primary" type="submit" disabled={busy}>Generate for all students</button>
        </form>
      </div>

      <div className="card full-width">
        <div className="panel-toolbar">
          <h3>Known users</h3>
          <button className="btn btn-secondary" onClick={loadDashboard}>Reload users</button>
        </div>
        {users.length === 0 ? (
          <p>No users loaded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Role</th>
                <th>Name</th>
                <th>Reference</th>
                <th>Year</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td>{user._id}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.first_name} {user.last_name}</td>
                  <td>{user.role === 'student' ? user.roll_no || 'N/A' : user.employee_id || 'N/A'}</td>
                  <td>{user.role === 'student' ? user.year || 'N/A' : 'N/A'}</td>
                  <td>
                    <div className="action-row">
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingUser({ ...user })}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => handleDeleteUser(user._id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card full-width">
        <h3>Job postings</h3>
        {jobs.length === 0 ? (
          <p>No job postings created yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Branches</th>
                <th>Years</th>
                <th>Status</th>
                <th>Applicants</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job._id}>
                  <td>{job.title}</td>
                  <td>{job.company}</td>
                  <td>{job.allowed_branches?.join(', ')}</td>
                  <td>{job.allowed_years?.join(', ')}</td>
                  <td>{job.open ? 'Open' : 'Closed'}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => handleLoadJobApplications(job)}>
                      View applications
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedJob && (
        <div className="card full-width">
          <h3>Applications for {selectedJob.title}</h3>
          {jobApplications.length === 0 ? (
            <p>No applications submitted yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Branch</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobApplications.map((application) => (
                  <tr key={application._id}>
                    <td>{application.student?.first_name} {application.student?.last_name}</td>
                    <td>{application.student?.department || 'N/A'}</td>
                    <td>{application.student?.year || 'N/A'}</td>
                    <td>{application.status}</td>
                    <td>
                      <div className="action-row">
                        {application.status === 'applied' && (
                          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleUpdateApplicationStatus(selectedJob._id, application._id, 'offered')}>
                            Offer job
                          </button>
                        )}
                        {application.status === 'offered' && (
                          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => handleUpdateApplicationStatus(selectedJob._id, application._id, 'placed')}>
                            Mark placed
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editingUser && (
        <div className="card full-width">
          <h3>Edit user</h3>
          <form className="form-stack" onSubmit={handleUserUpdate}>
            <input value={editingUser.first_name || ''} onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })} required />
            <input value={editingUser.last_name || ''} onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })} required />
            <input type="email" value={editingUser.email || ''} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} required />
            <select value={editingUser.role || ''} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })} required>
              <option value="student">student</option>
              <option value="prof">prof</option>
              <option value="admin">admin</option>
            </select>
            {editingUser.role === 'student' && (
              <>
                <input value={editingUser.roll_no || ''} onChange={(e) => setEditingUser({ ...editingUser, roll_no: e.target.value, employee_id: undefined })} placeholder="Roll No" />
                <input type="number" min="1" value={editingUser.year || ''} onChange={(e) => setEditingUser({ ...editingUser, year: e.target.value })} placeholder="Year" />
              </>
            )}
            {editingUser.role === 'prof' && (
              <input value={editingUser.employee_id || ''} onChange={(e) => setEditingUser({ ...editingUser, employee_id: e.target.value, roll_no: undefined })} placeholder="Employee ID" />
            )}
            <div className="action-row">
              <button className="btn btn-primary" type="submit" disabled={busy}>Save user</button>
              <button className="btn btn-secondary" type="button" onClick={() => setEditingUser(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card full-width">
        <h3>Courses</h3>
        {courses.length === 0 ? (
          <p>No courses found yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Credits</th>
                <th>Professor</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course._id}>
                  <td>{course.course_code}</td>
                  <td>{course.course_name}</td>
                  <td>{course.credits}</td>
                  <td>{course.professor ? `${course.professor.first_name} ${course.professor.last_name}` : 'N/A'}</td>
                  <td>
                    <div className="action-row">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setEditingCourse({
                          _id: course._id,
                          course_code: course.course_code,
                          course_name: course.course_name,
                          credits: course.credits,
                          professor: course.professor?._id || '',
                        })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() => handleDeleteCourse(course._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingCourse && (
        <div className="card full-width">
          <h3>Edit course</h3>
          <form className="form-stack" onSubmit={handleCourseUpdate}>
            <input value={editingCourse.course_code || ''} onChange={(e) => setEditingCourse({ ...editingCourse, course_code: e.target.value })} required />
            <input value={editingCourse.course_name || ''} onChange={(e) => setEditingCourse({ ...editingCourse, course_name: e.target.value })} required />
            <input type="number" min="1" value={editingCourse.credits || ''} onChange={(e) => setEditingCourse({ ...editingCourse, credits: e.target.value })} required />
            <select value={editingCourse.professor || ''} onChange={(e) => setEditingCourse({ ...editingCourse, professor: e.target.value })} required>
              <option value="">Select professor</option>
              {profs.map((prof) => (
                <option key={prof._id} value={prof._id}>
                  {prof.first_name} {prof.last_name} ({prof.employee_id || prof.email})
                </option>
              ))}
            </select>
            <div className="action-row">
              <button className="btn btn-primary" type="submit" disabled={busy}>Save course</button>
              <button className="btn btn-secondary" type="button" onClick={() => setEditingCourse(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card full-width">
        <h3>Timetable entries</h3>
        {timetable.length === 0 ? (
          <p>No timetable entries found yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Day</th>
                <th>Time</th>
                <th>Room</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {timetable.map((item) => (
                <tr key={item._id}>
                  <td>{item.course?.course_code || 'N/A'}</td>
                  <td>{item.day_of_week}</td>
                  <td>{item.start_time} - {item.end_time}</td>
                  <td>{item.room_no || 'N/A'}</td>
                  <td>
                    <div className="action-row">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setEditingTimetable({
                          _id: item._id,
                          course: item.course?._id || '',
                          day_of_week: item.day_of_week,
                          start_time: item.start_time,
                          end_time: item.end_time,
                          room_no: item.room_no || '',
                        })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() => handleDeleteTimetable(item._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingTimetable && (
        <div className="card full-width">
          <h3>Edit timetable entry</h3>
          <form className="form-stack" onSubmit={handleTimetableUpdate}>
            <select value={editingTimetable.course || ''} onChange={(e) => setEditingTimetable({ ...editingTimetable, course: e.target.value })} required>
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course._id} value={course._id}>
                  {course.course_code} - {course.course_name}
                </option>
              ))}
            </select>
            <input value={editingTimetable.day_of_week || ''} onChange={(e) => setEditingTimetable({ ...editingTimetable, day_of_week: e.target.value })} required />
            <input value={editingTimetable.start_time || ''} onChange={(e) => setEditingTimetable({ ...editingTimetable, start_time: e.target.value })} required />
            <input value={editingTimetable.end_time || ''} onChange={(e) => setEditingTimetable({ ...editingTimetable, end_time: e.target.value })} required />
            <input value={editingTimetable.room_no || ''} onChange={(e) => setEditingTimetable({ ...editingTimetable, room_no: e.target.value })} />
            <div className="action-row">
              <button className="btn btn-primary" type="submit" disabled={busy}>Save timetable</button>
              <button className="btn btn-secondary" type="button" onClick={() => setEditingTimetable(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card full-width">
        <h3>Generated fee demands</h3>
        {fees.length === 0 ? (
          <p>No fee demands generated yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Demand No.</th>
                <th>Student</th>
                <th>Semester</th>
                <th>Academic Year</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee._id}>
                  <td>{fee.demand_number}</td>
                  <td>{fee.student?.first_name} {fee.student?.last_name}</td>
                  <td>{fee.semester}</td>
                  <td>{fee.academic_year}</td>
                  <td>INR {Number(fee.amount).toFixed(2)}</td>
                  <td>{new Date(fee.due_date).toLocaleDateString()}</td>
                  <td>{fee.status}</td>
                  <td>
                    {fee.status === 'paid' ? (
                      'Fulfilled'
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => handleFulfillFee(fee._id)}
                      >
                        Fulfill demand
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
