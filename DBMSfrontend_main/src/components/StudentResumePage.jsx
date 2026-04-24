import { useState } from 'react';
import { studentGenerateResume } from '../api.js';

function StudentResumePage({ onMessage }) {
  const [form, setForm] = useState({
    targetRole: '',
    description: '',
  });
  const [busy, setBusy] = useState(false);

  async function handleGenerateResume(event) {
    event.preventDefault();
    setBusy(true);
    onMessage('');

    try {
      const blob = await studentGenerateResume({
        target_role: form.targetRole,
        description: form.description,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'student-resume.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      onMessage('Resume PDF generated successfully.');
    } catch (err) {
      onMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <div className="card full-width">
        <h3>Resume generator</h3>
        <p className="hint">
          Describe your skills, projects, internships, strengths, technical tools, and career goals.
          The generated PDF will combine that with your academic profile and enrolled-course details.
        </p>
        <form className="form-stack" onSubmit={handleGenerateResume}>
          <input
            placeholder="Target role, e.g. Software Engineering Intern"
            value={form.targetRole}
            onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
          />
          <label>
            Description and skills
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Mention your projects, programming languages, frameworks, leadership roles, hackathons, achievements, internships, and the skills you want highlighted."
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Generating resume...' : 'Generate resume PDF'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default StudentResumePage;
