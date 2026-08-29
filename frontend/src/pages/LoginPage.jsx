import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isFirebaseConfigured } from '../firebase/setupCheck';
import { getPostAuthPath } from '../utils/authFlow';

function mapAuthError(code) {
  const messages = {
    'auth/invalid-email': '올바른 이메일 형식이 아닙니다.',
    'auth/user-disabled': '비활성화된 계정입니다.',
    'auth/user-not-found': '등록되지 않은 이메일입니다.',
    'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/too-many-requests': '잠시 후 다시 시도해 주세요.',
  };
  return messages[code] || '로그인에 실패했습니다. 다시 시도해 주세요.';
}

export default function LoginPage() {
  const { signIn, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const firebaseReady = isFirebaseConfigured();

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!firebaseReady) {
      setError('Firebase 설정이 필요합니다. frontend/.env 에 웹 앱 설정값을 넣어 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(form);
      const latest = await refreshProfile();
      navigate(getPostAuthPath(latest));
    } catch (err) {
      setError(mapAuthError(err.code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell auth-shell-public">
      <main className="auth-card">
        <Link to="/" className="brand auth-brand">
          Money is Always Right
        </Link>
        <h1>로그인</h1>
        <p className="muted">맞춤형 자산 관리를 시작하려면 로그인해 주세요.</p>
        {!firebaseReady && (
          <p className="alert alert-error" role="status">
            Firebase 웹 설정값이 아직 비어 있습니다. `frontend/.env`를 채운 뒤
            개발 서버를 다시 시작해 주세요.
          </p>
        )}

        <form onSubmit={onSubmit} className="form-stack">
          <label>
            이메일
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>

          <label>
            비밀번호
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              placeholder="비밀번호를 입력하세요"
              required
              autoComplete="current-password"
            />
          </label>

          {error && <p className="alert alert-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/forgot-password">비밀번호를 잊으셨나요?</Link>
          <Link to="/signup">아직 계정이 없나요? 회원가입</Link>
        </div>
      </main>
    </div>
  );
}
