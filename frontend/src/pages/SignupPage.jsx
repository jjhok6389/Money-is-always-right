import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function mapAuthError(code) {
  const messages = {
    'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
    'auth/invalid-email': '올바른 이메일 형식이 아닙니다.',
    'auth/weak-password': '비밀번호는 최소 6자 이상이어야 합니다.',
  };
  return messages[code] || '회원가입에 실패했습니다. 다시 시도해 주세요.';
}

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSubmitting(true);
    try {
      await signUp({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
      });
      navigate('/onboarding');
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
        <h1>회원가입</h1>
        <p className="muted">청년 맞춤 자산 관리를 위한 계정을 만들어 보세요.</p>

        <form onSubmit={onSubmit} className="form-stack">
          <label>
            이름
            <input
              type="text"
              name="displayName"
              value={form.displayName}
              onChange={onChange}
              placeholder="홍길동"
              required
              autoComplete="name"
            />
          </label>

          <label>
            이메일 (아이디)
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
              placeholder="최소 6자 이상"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          <label>
            비밀번호 확인
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={onChange}
              placeholder="비밀번호를 다시 입력하세요"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          {error && <p className="alert alert-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/login">이미 계정이 있나요? 로그인</Link>
        </div>
      </main>
    </div>
  );
}
