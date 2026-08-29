import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  {
    to: '/',
    label: '내 금융생활',
    match: '/dashboard', // 레거시 /dashboard 도 대시보드 메뉴로 판정
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: '/simulation',
    label: '시뮬레이션',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 20h18" />
        <path d="M4 15l4-4 3 2 5-6 4 3" />
      </svg>
    ),
  },
  {
    to: '/transactions',
    label: '소비 분석',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M9 9.5c0-1.1 1.3-2 3-2s3 .9 3 2-1.3 2-3 2-3 .9-3 2 1.3 2 3 2 3-.9 3-2" />
      </svg>
    ),
  },
  {
    to: '/products',
    label: '금융상품',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
      </svg>
    ),
  },
];

const USER_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </svg>
);

const LOGOUT_ICON = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);

function NavLinks({ location, user, isOnboarded }) {
  const isActive = (item) => {
    if (item.match) {
      return (
        location.pathname === item.to ||
        location.pathname === item.match ||
        location.pathname.startsWith(`${item.match}/`)
      );
    }
    return (
      location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
    );
  };

  return (
    <>
      {user && isOnboarded && (
        <ul className="nav-list" role="list" data-tour="nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className={`nav-chip${isActive(item) ? ' is-active' : ''}`}
                aria-current={isActive(item) ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function AppHeader() {
  const { user, logOut, isOnboarded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="side-nav">
        <Link to="/" className="brand">
          Money is Always Right
        </Link>
        <nav aria-label="주 메뉴">
          <NavLinks location={location} user={user} isOnboarded={isOnboarded} />
          {user ? (
            <ul className="nav-list side-nav-secondary" role="list">
              <li>
                <Link
                  to={isOnboarded ? '/mypage' : '/onboarding'}
                  className={`nav-chip${location.pathname === '/mypage' ? ' is-active' : ''}`}
                  title="마이페이지 · 프로필 수정"
                >
                  {USER_ICON}마이페이지
                </Link>
              </li>
              <li>
                <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                  {LOGOUT_ICON}로그아웃
                </button>
              </li>
            </ul>
          ) : (
            <ul className="nav-list side-nav-secondary" role="list">
              <li>
                <Link to="/login" className="btn btn-ghost">
                  로그인
                </Link>
              </li>
              <li>
                <Link to="/signup" className="btn btn-primary">
                  회원가입
                </Link>
              </li>
            </ul>
          )}
        </nav>
      </aside>

      {/* 모바일·태블릿 상단 헤더 */}
      <header className="app-header mobile-header">
        <Link to="/" className="brand">
          Money is Always Right
        </Link>
        <nav className="header-nav" aria-label="주 메뉴">
          <NavLinks location={location} user={user} isOnboarded={isOnboarded} />
        </nav>
        <div className="mobile-header-actions">
          {user ? (
            <>
              <Link
                to={isOnboarded ? '/mypage' : '/onboarding'}
                className={`btn btn-ghost mobile-icon-action${location.pathname === '/mypage' ? ' is-active' : ''}`}
                aria-label="마이페이지"
                title="마이페이지 · 프로필 수정"
              >
                {USER_ICON}
              </Link>
              <button
                type="button"
                className="btn btn-ghost mobile-icon-action"
                onClick={handleLogout}
                aria-label="로그아웃"
                title="로그아웃"
              >
                {LOGOUT_ICON}
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
        </div>
      </header>
    </>
  );
}
