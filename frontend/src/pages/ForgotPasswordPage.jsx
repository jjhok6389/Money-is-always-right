import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';

function mapAuthError(code) {
  const messages = {
    'auth/invalid-email': '올바른 이메일 형식이 아닙니다.',
    'auth/user-not-found': '등록되지 않은 이메일입니다.',
    'auth/missing-email': '이메일을 입력해 주세요.',
  };
  return messages[code] || '비밀번호 재설정 메일 발송에 실패했습니다.';
}

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await resetPassword(email);
      setSuccess('비밀번호 재설정 링크를 이메일로 보냈습니다. 받은편지함을 확인해 주세요.');
    } catch (err) {
      setError(mapAuthError(err.code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <AppHeader />
      <main className="auth-card">
        <h1>비밀번호 찾기</h1>
        <p className="muted">
          가입하신 이메일(아이디)로 재설정 링크를 보내드립니다.
        </p>

        <form onSubmit={onSubmit} className="form-stack">
          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>

          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {success && <p className="alert alert-success" role="status">{success}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '전송 중...' : '재설정 메일 보내기'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/login">로그인으로 돌아가기</Link>
        </div>
      </main>
    </div>
  );
}
