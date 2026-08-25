import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: '대시보드' },
  { to: '/reports', label: '리포트' },
  { to: '/simulation', label: '시뮬레이션' },
  { to: '/transactions', label: '소비 분석' },
  { to: '/products', label: '금융상품' },
];

export default function AppHeader() {
  const { user, profile, logOut, isOnboarded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  const displayName = profile?.displayName || user?.displayName || user?.email || '회원';

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        Money is Always Right
      </Link>
      <nav className="header-nav" aria-label="주 메뉴">
        {user && isOnboarded && (
          <>
            {NAV_ITEMS.map((item) => {
              const active =
                location.pathname === item.to ||
                location.pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`nav-chip${active ? ' is-active' : ''}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
        {user ? (
          <>
            <Link
              to={isOnboarded ? '/mypage' : '/onboarding'}
              className={`nav-chip nav-chip-user${location.pathname === '/mypage' ? ' is-active' : ''}`}
              title="마이페이지 · 프로필 수정"
            >
              {displayName}
            </Link>
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
