import { Link } from 'react-router-dom';
import { TUTORIAL_CHAPTERS } from '../data/tutorialChapters';
import useTutorialProgress from '../hooks/useTutorialProgress';

export default function TutorialProgressPanel({ detailed = false, compact = false }) {
  const { progress, loading, error, refresh } = useTutorialProgress();
  const completed = progress?.completedCount || 0;
  const nextChapter = TUTORIAL_CHAPTERS.find((chapter) => !progress?.chapters?.[chapter.id]?.completed);
  const pct = Math.round((completed / TUTORIAL_CHAPTERS.length) * 100);
  const href = nextChapter ? `/tutorial/${nextChapter.id}` : '/tutorial';

  if (compact) {
    const label = loading ? '불러오는 중…' : error ? '다시 시도' : `${pct}%`;
    return (
      <Link
        to={error ? '#' : href}
        className="tutorial-entry-btn"
        data-tour="tutorial-entry"
        aria-label={error ? '금융기초 튜토리얼 진행 상태를 다시 불러오세요' : `금융기초 튜토리얼, 진행률 ${pct}%`}
        onClick={error ? (event) => { event.preventDefault(); refresh(); } : undefined}
      >
        <span className="tutorial-entry-btn-label">금융기초 튜토리얼</span>
        <span className="tutorial-entry-btn-pct">{label}</span>
      </Link>
    );
  }

  return (
    <section className={`tutorial-widget${detailed ? ' is-detailed' : ''}`} aria-labelledby={detailed ? 'mypage-tutorial-title' : 'dashboard-tutorial-title'}>
      <div className="tutorial-widget-head">
        <div>
          <p className="eyebrow">금융기초 튜토리얼</p>
          <h2 id={detailed ? 'mypage-tutorial-title' : 'dashboard-tutorial-title'}>
            {loading ? '진행 상황을 확인하고 있어요' : `${completed} / 6 완료`}
          </h2>
        </div>
        {!loading && !error && <span className="tutorial-progress-number">{pct}%</span>}
      </div>

      {error ? (
        <div className="tutorial-widget-error">
          <p>{error}</p>
          <button type="button" className="btn btn-ghost" onClick={refresh}>다시 불러오기</button>
        </div>
      ) : (
        <>
          <div className="tutorial-progress-track" role="progressbar" aria-label="금융기초 튜토리얼 진행률" aria-valuemin="0" aria-valuemax="6" aria-valuenow={completed}>
            <span style={{ width: `${pct}%` }} />
          </div>

          {detailed && progress && (
            <ol className="tutorial-widget-list">
              {TUTORIAL_CHAPTERS.map((chapter) => {
                const done = progress.chapters?.[chapter.id]?.completed;
                return <li key={chapter.id} className={done ? 'is-complete' : ''}><span aria-hidden="true">{done ? '✓' : '○'}</span>{chapter.number}. {chapter.title}</li>;
              })}
            </ol>
          )}

          {!loading && (
            <div className="tutorial-widget-action">
              <p>{nextChapter ? `다음 퀘스트 · ${nextChapter.title}` : '모든 금융기초 퀘스트를 완료했습니다.'}</p>
              <Link to={href} className="btn btn-primary">
                {nextChapter ? '이어하기' : '완료 내역 보기'}
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
