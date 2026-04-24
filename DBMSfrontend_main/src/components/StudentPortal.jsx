import { useEffect, useState } from 'react';
import StudentHomePage from './StudentHomePage.jsx';
import StudentTimetablePage from './StudentTimetablePage.jsx';
import StudentResumePage from './StudentResumePage.jsx';

const STUDENT_PAGES = [
  { id: 'home', label: 'Dashboard' },
  { id: 'timetable', label: 'Timetable' },
  { id: 'resume', label: 'Resume Builder' },
];

function getCurrentStudentPage() {
  const hash = window.location.hash.replace(/^#/, '');
  const page = hash.startsWith('student/') ? hash.split('/')[1] : 'home';
  return STUDENT_PAGES.some((item) => item.id === page) ? page : 'home';
}

function StudentPortal({ onMessage }) {
  const [page, setPage] = useState(getCurrentStudentPage());

  useEffect(() => {
    function handleHashChange() {
      setPage(getCurrentStudentPage());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function navigate(nextPage) {
    window.location.hash = `student/${nextPage}`;
    setPage(nextPage);
  }

  return (
    <div className="student-portal">
      <div className="page-tabs">
        {STUDENT_PAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`page-tab ${page === item.id ? 'page-tab-active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {page === 'home' && <StudentHomePage onMessage={onMessage} />}
      {page === 'timetable' && <StudentTimetablePage onMessage={onMessage} />}
      {page === 'resume' && <StudentResumePage onMessage={onMessage} />}
    </div>
  );
}

export default StudentPortal;
