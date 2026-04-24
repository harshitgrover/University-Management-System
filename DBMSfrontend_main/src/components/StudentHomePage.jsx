import { useEffect, useState } from 'react';
import {
  studentDownloadFeeReceipt,
  studentFetchAnnouncements,
  studentFetchAvailableCourses,
  studentFetchAvailableJobs,
  studentFetchApplications,
  studentFetchCourses,
  studentFetchFees,
  studentFetchProfile,
  studentFulfillFeeDemand,
  studentRegisterCourse,
  studentApplyJob,
  studentAcceptApplication,
  studentMarkPlaced,
} from '../api.js';

function StudentHomePage({ onMessage }) {
  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [fees, setFees] = useState([]);
  const [registrationId, setRegistrationId] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingFees = fees.filter((fee) => fee.status !== 'paid');
  const paidFees = fees.filter((fee) => fee.status === 'paid');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [profileData, coursesData, availableCoursesData, availableJobsData, applicationsData, announcementsData, feeData] = await Promise.all([
        studentFetchProfile(),
        studentFetchCourses(),
        studentFetchAvailableCourses(),
        studentFetchAvailableJobs(),
        studentFetchApplications(),
        studentFetchAnnouncements(),
        studentFetchFees(),
      ]);
      setProfile(profileData);
      setCourses(coursesData);
      setAvailableCourses(availableCoursesData);
      setAvailableJobs(availableJobsData);
      setApplications(applicationsData);
      setAnnouncements(announcementsData);
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
      await loadAll();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyJob(jobId) {
    setBusy(true);
    onMessage('');
    try {
      const result = await studentApplyJob(jobId);
      onMessage(result.message || 'Application submitted');
      await loadAll();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptOffer(applicationId) {
    setBusy(true);
    onMessage('');
    try {
      const result = await studentAcceptApplication(applicationId);
      onMessage(result.message || 'Offer accepted');
      await loadAll();
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkPlaced(applicationId) {
    setBusy(true);
    onMessage('');
    try {
      const result = await studentMarkPlaced(applicationId);
      onMessage(result.message || 'Placement confirmed');
      await loadAll();
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
          <p>Loading profile...</p>
        )}
      </div>

      <div className="card">
        <h3>Register for a course</h3>
        <form className="form-stack" onSubmit={handleRegister}>
          <select value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} required>
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
        <h3>Available jobs</h3>
        {availableJobs.length === 0 ? (
          <p>No active jobs available for your branch and year.</p>
        ) : (
          <ul className="item-list">
            {availableJobs.map((job) => (
              <li key={job._id}>
                <strong>{job.title}</strong> at {job.company}
                <p>{job.description}</p>
                <div>Branches: {job.allowed_branches.join(', ')}</div>
                <div>Years: {job.allowed_years.join(', ')}</div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => handleApplyJob(job._id)}
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card full-width">
        <h3>My job applications</h3>
        {applications.length === 0 ? (
          <p>You have no job applications yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Company</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application._id}>
                  <td>{application.job?.title || 'N/A'}</td>
                  <td>{application.job?.company || 'N/A'}</td>
                  <td>{application.status}</td>
                  <td>
                    <div className="action-row">
                      {application.status === 'offered' && (
                        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleAcceptOffer(application._id)}>
                          Accept offer
                        </button>
                      )}
                      {['offered', 'accepted'].includes(application.status) && (
                        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => handleMarkPlaced(application._id)}>
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

      <div className="card full-width">
        <h3>Registered courses</h3>
        {courses.length === 0 ? (
          <p>No courses registered.</p>
        ) : (
          <ul className="item-list">
            {courses.map((item) => (
              <li key={item._id}>
                <strong>{item.course.course_code}</strong> - {item.course.course_name}
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
        {pendingFees.length === 0 ? (
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
              </tr>
            </thead>
            <tbody>
              {pendingFees.map((fee) => (
                <tr key={fee._id}>
                  <td>{fee.demand_number}</td>
                  <td>{fee.semester}</td>
                  <td>{fee.academic_year}</td>
                  <td>INR {Number(fee.amount).toFixed(2)}</td>
                  <td>{new Date(fee.due_date).toLocaleDateString()}</td>
                  <td>{fee.status}</td>
                  <td>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleFulfillFee(fee._id)}>
                      Fulfill demand
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card full-width">
        <h3>Paid fee receipts</h3>
        {paidFees.length === 0 ? (
          <p>No paid fee receipts available yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Demand No.</th>
                <th>Semester</th>
                <th>Academic Year</th>
                <th>Amount</th>
                <th>Paid On</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {paidFees.map((fee) => (
                <tr key={fee._id}>
                  <td>{fee.demand_number}</td>
                  <td>{fee.semester}</td>
                  <td>{fee.academic_year}</td>
                  <td>INR {Number(fee.amount).toFixed(2)}</td>
                  <td>{fee.paid_at ? new Date(fee.paid_at).toLocaleDateString() : 'N/A'}</td>
                  <td>{fee.status}</td>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => handleReceiptDownload(fee._id, fee.demand_number)}>
                      Download receipt
                    </button>
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

export default StudentHomePage;
