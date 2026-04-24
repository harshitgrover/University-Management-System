import { useEffect, useState } from 'react';
import {
  studentFetchAvailableCourses,
  studentFetchAnnouncements,
  studentFetchCourses,
  studentDownloadFeeReceipt,
  studentFetchFees,
  studentFulfillFeeDemand,
  studentFetchProfile,
  studentFetchTimetable,
  studentRegisterCourse,
} from '../api.js';

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function StudentDashboard({ onMessage }) {
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [fees, setFees] = useState([]);
  const [registrationId, setRegistrationId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [profileData, coursesData, availableCoursesData, announcementsData, timetableData, feeData] = await Promise.all([
        studentFetchProfile(),
        studentFetchCourses(),
        studentFetchAvailableCourses(),
        studentFetchAnnouncements(),
        studentFetchTimetable(),
        studentFetchFees(),
      ]);
      setProfile(profileData);
      setCourses(coursesData);
      setAvailableCourses(availableCoursesData);
      setAnnouncements(announcementsData);
      setTimetable(timetableData);
      setFees(feeData);
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setBusy(true);
    onMessage('');

    try {
      const result = await studentRegisterCourse(registrationId);
      onMessage(result.message || 'Course registered');
      setRegistrationId('');
      loadAll();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReceiptDownload(feeId, demandNumber) {
    try {
      onMessage('');
      const blob = await studentDownloadFeeReceipt(feeId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${demandNumber || 'fee-receipt'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      onMessage('Fee receipt downloaded.');
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function handleFulfillFee(feeId) {
    setBusy(true);
    onMessage('');

    try {
      const result = await studentFulfillFeeDemand(feeId);
      onMessage(result.message || 'Fee fulfilled');
      await loadAll();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const timetableByDay = WEEK_DAYS.reduce((acc, day) => {
    acc[day] = timetable
      .filter((item) => item.day_of_week === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    return acc;
  }, {});

  return (
    <div className="dashboard-grid">
      <div className="card">
        <h3>Profile</h3>
        {profile ? (
          <div className="entity-card">
            <p><strong>{profile.first_name} {profile.last_name}</strong></p>
            <p>{profile.email}</p>
            <p>Roll No: {profile.roll_no || 'N/A'}</p>
          </div>
        ) : (
          <p>Loading profile…</p>
        )}
      </div>

      <div className="card">
        <h3>Register for a course</h3>
        <form className="form-stack" onSubmit={handleRegister}>
          <select
            value={registrationId}
            onChange={(e) => setRegistrationId(e.target.value)}
            required
          >
            <option value="">Select a course</option>
            {availableCourses.map((course) => (
              <option key={course._id} value={course._id}>
                {course.course_code} - {course.course_name}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit" disabled={busy}>Register</button>
        </form>
        <p className="hint">
          {availableCourses.length > 0
            ? 'Only courses you have not already registered for are shown here.'
            : 'No open courses available right now.'}
        </p>
      </div>

      <div className="card full-width">
        <h3>Registered courses</h3>
        {courses.length === 0 ? (
          <p>No courses registered.</p>
        ) : (
          <ul className="item-list">
            {courses.map((item) => (
              <li key={item._id}>
                <strong>{item.course.course_code}</strong> — {item.course.course_name}
                <div>Professor: {item.course.professor.first_name} {item.course.professor.last_name}</div>
                <div>Course ID: {item.course._id}</div>
                <div>Credits: {item.course.credits}</div>
                <div>Marks: {item.marks ?? 'N/A'} | Grade: {item.grade || 'N/A'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card full-width">
        <h3>Announcements</h3>
        {announcements.length === 0 ? (
          <p>No announcements yet.</p>
        ) : (
          <ul className="item-list">
            {announcements.map((item) => (
              <li key={item._id}>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <small>{item.course.course_code} by {item.professor.first_name} {item.professor.last_name}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card full-width">
        <h3>Pending fee demands</h3>
        {fees.length === 0 ? (
          <p>No pending fee records found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Demand No.</th>
                <th>Semester</th>
                <th>Academic Year</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Fulfill</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee._id}>
                  <td>{fee.demand_number}</td>
                  <td>{fee.semester}</td>
                  <td>{fee.academic_year}</td>
                  <td>INR {Number(fee.amount).toFixed(2)}</td>
                  <td>{new Date(fee.due_date).toLocaleDateString()}</td>
                  <td>{fee.status}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => handleFulfillFee(fee._id)}
                    >
                      Fulfill demand
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleReceiptDownload(fee._id, fee.demand_number)}
                    >
                      Download PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card full-width">
        <h3>Timetable</h3>
        {timetable.length === 0 ? (
          <p>No timetable items found.</p>
        ) : (
          <div className="calendar-grid">
            {WEEK_DAYS.map((day) => (
              <section key={day} className="calendar-day">
                <header className="calendar-day-header">{day}</header>
                <div className="calendar-day-body">
                  {timetableByDay[day].length === 0 ? (
                    <p className="calendar-empty">No classes</p>
                  ) : (
                    timetableByDay[day].map((item) => (
                      <article key={item._id} className="calendar-event">
                        <div className="calendar-time">{item.start_time} - {item.end_time}</div>
                        <div className="calendar-course">{item.course.course_code}</div>
                        <div className="calendar-course-name">{item.course.course_name}</div>
                        <div className="calendar-room">Room: {item.room_no || 'N/A'}</div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentDashboard;
