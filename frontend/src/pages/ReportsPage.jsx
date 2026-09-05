import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../contexts/AuthContext';
import {
  getReportSchedule,
  listReports,
  updateReportSchedule,
} from '../services/reportService';

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function ReportsPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [day, setDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [list, schedule] = await Promise.all([listReports(), getReportSchedule()]);
      setReports(list || []);
      setDay(
        schedule?.monthlyReportDay != null && schedule.monthlyReportDay !== ''
          ? String(schedule.monthlyReportDay)
          : profile?.monthlyReportDay != null
            ? String(profile.monthlyReportDay)
            : '',
      );
      setNote(schedule?.scheduleNote || '');
    } catch (err) {
      setError(err.message || '리포트 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  const saveSchedule = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const value = day === '' ? null : Number(day);
      if (value != null && (value < 1 || value > 28)) {
        throw new Error('날짜는 1~28일 사이로 지정해 주세요.');
      }
      const saved = await updateReportSchedule(value);
      setDay(saved.monthlyReportDay != null ? String(saved.monthlyReportDay) : '');
      setNote(saved.scheduleNote || note);
      if (refreshProfile) await refreshProfile();
    } catch (err) {
      setError(err.message || '스케줄을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl reports-page">
        <section className="hero-panel">
          <p className="eyebrow">코칭 리포트</p>
          <h1>내 금융 보고서</h1>
          <p className="lead">저장된 스토리형 리포트를 다시 보거나, 매월 받을 날짜를 지정할 수 있습니다.</p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/coach-report')}
            >
              첫 리포트 만들기
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate('/coach-report?type=monthly')}
              disabled={!reports.length}
            >
              월간 비교 리포트 만들기
            </button>
          </div>
        </section>

        <div className="reports-workspace">
          <section className="profile-summary">
            <h2>월간 리포트 일정</h2>
            <form className="form-stack" onSubmit={saveSchedule}>
              <label>
                매월 받을 날짜 (1~28)
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  placeholder="예: 1"
                />
              </label>
              <p className="muted">{note || '알림 발송은 추후 연동됩니다. 날짜만 저장됩니다.'}</p>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '저장 중…' : '일정 저장'}
              </button>
            </form>
          </section>

          <section className="profile-summary">
            <h2>보관함</h2>
            {loading && <p className="muted">불러오는 중…</p>}
            {error && <p className="alert alert-error">{error}</p>}
            {!loading && !reports.length && (
              <p className="muted">아직 저장된 리포트가 없습니다. 금융 코치를 시작해 보세요.</p>
            )}
            <ul className="report-list">
              {reports.map((item) => (
                <li key={item.reportId}>
                  <div>
                    <strong>{item.type === 'monthly' ? '월간 비교' : '첫'} 리포트</strong>
                    <p className="muted">
                      {formatDate(item.createdAt)} · 여력{' '}
                      {Number(item.capacity || 0).toLocaleString('ko-KR')}원
                      {item.monthsScenarioLabel ? ` · ${item.monthsScenarioLabel}` : ''}
                    </p>
                  </div>
                  <Link className="btn btn-ghost" to={`/reports/play/${item.reportId}`}>
                    다시 보기
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
