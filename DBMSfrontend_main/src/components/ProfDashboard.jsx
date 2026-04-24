import { useEffect, useState } from 'react';
import {
  profCreateAnnouncement,
  profFetchCourses,
  profFetchStudents,
  profUpdateMarks,
} from '../api.js';

function ProfDashboard({ onMessage }) {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [marks, setMarks] = useState({});
  const [announcement, setAnnouncement] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [studentData, courseData] = await Promise.all([
        profFetchStudents(),
        profFetchCourses(),
      ]);
      setStudents(studentData);
      setCourses(courseData);
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function handleMarksSubmit(event) {
    event.preventDefault();
    setBusy(true);
    onMessage('');

    try {
      const result = await profUpdateMarks({
        studentId: marks.studentId,
        courseId: marks.courseId,
        marks: Number(marks.marks),
        grade: marks.grade,
      });
      onMessage(result.message || 'Marks updated');
      await loadDashboard();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAnnouncementSubmit(event) {
    event.preventDefault();
    setBusy(true);
    onMessage('');

    try {
      const result = await profCreateAnnouncement({
        courseId: announcement.courseId,
        title: announcement.title,
        message: announcement.message,
      });
      onMessage(result.message || 'Announcement created');
      setAnnouncement({});
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <div className="card full-width">
        <h3>Enrolled students</h3>
        {students.length === 0 ? (
          <p>No enrollments found yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll</th>
                <th>Course</th>
                <th>Marks</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {students.map((item) => (
                <tr key={`${item.student._id}-${item.course._id}`}>
                  <td>{item.student.first_name} {item.student.last_name}</td>
                  <td>{item.student.roll_no}</td>
                  <td>{item.course.course_code} - {item.course.course_name}</td>
                  <td>{item.marks ?? 'N/A'}</td>
                  <td>{item.grade || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Your courses</h3>
        {courses.length === 0 ? (
          <p>No assigned courses found.</p>
        ) : (
          <ul className="item-list">
            {courses.map((course) => (
              <li key={course._id}>
                <strong>{course.course_code}</strong> - {course.course_name}
                <div>Course ID: {course._id}</div>
                <div>Credits: {course.credits}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Update marks</h3>
        <form className="form-stack" onSubmit={handleMarksSubmit}>
          <select
            value={marks.courseId || ''}
            onChange={(e) => setMarks({ ...marks, courseId: e.target.value })}
            required
          >
            <option value="">Select course</option>
            {courses.map((course) => (
              <option key={course._id} value={course._id}>
                {course.course_code} - {course.course_name}
              </option>
            ))}
          </select>
          <select
            value={marks.studentId || ''}
            onChange={(e) => setMarks({ ...marks, studentId: e.target.value })}
            required
          >
            <option value="">Select student</option>
            {students
              .filter((item) => !marks.courseId || item.course._id === marks.courseId)
              .map((item) => (
                <option key={`${item.student._id}-${item.course._id}`} value={item.student._id}>
                  {item.student.first_name} {item.student.last_name} ({item.course.course_code})
                </option>
              ))}
          </select>
          <input placeholder="Marks" type="number" min="0" max="100" value={marks.marks || ''} onChange={(e) => setMarks({ ...marks, marks: e.target.value })} />
          <input placeholder="Grade" value={marks.grade || ''} onChange={(e) => setMarks({ ...marks, grade: e.target.value })} />
          <button className="btn btn-primary" type="submit" disabled={busy}>Update marks</button>
        </form>
      </div>

      <div className="card">
        <h3>Post announcement</h3>
        <form className="form-stack" onSubmit={handleAnnouncementSubmit}>
          <select
            value={announcement.courseId || ''}
            onChange={(e) => setAnnouncement({ ...announcement, courseId: e.target.value })}
            required
          >
            <option value="">Select course</option>
            {courses.map((course) => (
              <option key={course._id} value={course._id}>
                {course.course_code} - {course.course_name}
              </option>
            ))}
          </select>
          <input placeholder="Title" value={announcement.title || ''} onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })} required />
          <textarea placeholder="Message" value={announcement.message || ''} onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })} required />
          <button className="btn btn-primary" type="submit" disabled={busy}>Create announcement</button>
        </form>
      </div>
    </div>
  );
}

export default ProfDashboard;
