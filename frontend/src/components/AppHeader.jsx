import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AppHeader() {
  const { user, profile, logOut, isOnboarded } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        Money is Always Right
      </Link>
      <nav className="header-nav">
        {user && isOnboarded && (
          <>
            <Link to="/dashboard" className="nav-link">
              대시보드
            </Link>
            <Link to="/simulation" className="nav-link">
              시뮬레이션
            </Link>
            <Link to="/transactions" className="nav-link">
              소비 분석
            </Link>
            <Link to="/products" className="nav-link">
              예·적금
            </Link>
          </>
        )}
        {user ? (
          <>
            <span className="header-user">
              {profile?.displayName || user.displayName || user.email}
            </span>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              로그아웃
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost">
              로그인
            </Link>
            <Link to="/signup" className="btn btn-primary">
              회원가입
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
