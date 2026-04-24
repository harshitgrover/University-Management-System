import { useEffect, useState } from 'react';
import { studentFetchTimetable } from '../api.js';

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function StudentTimetablePage({ onMessage }) {
  const [timetable, setTimetable] = useState([]);

  useEffect(() => {
    loadTimetable();
  }, []);

  async function loadTimetable() {
    try {
      const data = await studentFetchTimetable();
      setTimetable(data);
    } catch (err) {
      onMessage(err.message);
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
      <div className="card full-width">
        <div className="panel-toolbar">
          <div>
            <h3>Weekly timetable</h3>
            <p className="hint">Calendar view of your registered classes for the week.</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={loadTimetable}>Refresh timetable</button>
        </div>

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

export default StudentTimetablePage;
