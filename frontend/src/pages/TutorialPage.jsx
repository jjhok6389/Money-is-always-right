import { useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import TutorialRewardDialog from '../components/TutorialRewardDialog';
import { FINAL_REWARD, MIDPOINT_REWARDS, TUTORIAL_CHAPTERS } from '../data/tutorialChapters';
import useTutorialProgress from '../hooks/useTutorialProgress';

function rewardLabel(rewardId) {
  return MIDPOINT_REWARDS.find((reward) => reward.id === rewardId)?.label || rewardId;
}

export default function TutorialPage() {
  const { progress, loading, saving, error, refresh, claimMidpoint, claimFinal } = useTutorialProgress();
  const [rewardDialog, setRewardDialog] = useState(null);
  const [celebration, setCelebration] = useState('');
  const completed = progress?.completedCount || 0;
  const pct = Math.round((completed / TUTORIAL_CHAPTERS.length) * 100);
  const midpointReady = completed >= 3 && !progress?.midpointReward?.claimed;
  const finalReady = completed === 6 && !progress?.finalReward?.claimed;

  const claimReward = async (rewardId) => {
    try {
      if (rewardDialog === 'final') {
        await claimFinal();
        setCelebration(`${FINAL_REWARD.label} Demo 보상을 받았습니다.`);
      } else {
        await claimMidpoint(rewardId);
        setCelebration(`${rewardLabel(rewardId)}을 받았습니다.`);
      }
      setRewardDialog(null);
    } catch {
      // The shared hook exposes the safe API error below.
    }
  };

  return (
    <div className="page-shell tutorial-shell">
      <AppHeader />
      <main className="page-content page-content-xl tutorial-page">
        <section className="hero-panel tutorial-hero">
          <p className="eyebrow">사회초년생 금융기초</p>
          <h1>읽고, 직접 바꾸고, 확인해보세요</h1>
          <p className="lead">각 챕터는 짧은 설명과 체험, 두 개의 퀴즈로 구성되어 있습니다. 약 3~5분이면 하나를 완료할 수 있어요.</p>
        </section>

        {error && (
          <div className="tutorial-load-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-ghost" onClick={refresh}>다시 불러오기</button>
          </div>
        )}

        <section className="tutorial-overview" aria-labelledby="tutorial-overview-title">
          <div className="tutorial-overview-copy">
            <p className="eyebrow">진행 상황</p>
            <h2 id="tutorial-overview-title">{loading ? '불러오는 중...' : `${completed} / 6 완료`}</h2>
          </div>
          {!loading && <strong>{pct}%</strong>}
          <div className="tutorial-progress-track" role="progressbar" aria-label="튜토리얼 진행률" aria-valuemin="0" aria-valuemax="6" aria-valuenow={completed}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </section>

        {!loading && progress && (
          <ol className="tutorial-chapter-list">
            {TUTORIAL_CHAPTERS.map((chapter, index) => {
              const done = progress.chapters?.[chapter.id]?.completed;
              const previous = TUTORIAL_CHAPTERS[index - 1];
              const locked = index > 0 && !progress.chapters?.[previous.id]?.completed;
              const content = (
                <>
                  <span className="tutorial-chapter-number">{done ? '✓' : String(chapter.number).padStart(2, '0')}</span>
                  <span className="tutorial-chapter-copy">
                    <strong>{chapter.title}</strong>
                    <small>{chapter.summary}</small>
                  </span>
                  <span className="tutorial-chapter-meta">{done ? '이수 완료' : locked ? '이전 챕터 완료 후 열림' : chapter.duration}</span>
                </>
              );
              return (
                <li key={chapter.id} className={`${done ? 'is-complete' : ''}${locked ? ' is-locked' : ''}`}>
                  {locked ? <div aria-disabled="true">{content}</div> : <Link to={`/tutorial/${chapter.id}`}>{content}</Link>}
                </li>
              );
            })}
          </ol>
        )}

        {!loading && progress && (
          <section className="tutorial-rewards" aria-labelledby="tutorial-rewards-title">
            <div>
              <p className="eyebrow">Demo 보상</p>
              <h2 id="tutorial-rewards-title">완주 보상</h2>
              <p className="muted">실제 쿠폰이나 금융상품이 아닌 해커톤 체험용 보상입니다.</p>
            </div>
            <div className="tutorial-reward-status">
              <article className={progress.midpointReward.claimed ? 'is-claimed' : ''}>
                <span className="tutorial-reward-milestone">3 / 6</span>
                <div className="tutorial-reward-copy">
                  <strong>선택형 Demo 쿠폰</strong>
                  <small>{progress.midpointReward.claimed ? `수령 완료 · ${rewardLabel(progress.midpointReward.rewardId)}` : midpointReady ? '지금 받을 수 있어요' : '3개 챕터 완료 시 열림'}</small>
                </div>
                {midpointReady && <button type="button" className="btn btn-primary" onClick={() => setRewardDialog('midpoint')}>쿠폰 선택</button>}
              </article>
              <article className={progress.finalReward.claimed ? 'is-claimed' : ''}>
                <span className="tutorial-reward-milestone">6 / 6</span>
                <div className="tutorial-reward-copy">
                  <strong>{FINAL_REWARD.label}</strong>
                  <small>{progress.finalReward.claimed ? 'Demo 자산 수령 완료' : finalReady ? '지금 받을 수 있어요' : '전체 완료 시 열림'}</small>
                </div>
                {finalReady && <button type="button" className="btn btn-primary" onClick={() => setRewardDialog('final')}>최종 보상 받기</button>}
              </article>
            </div>
          </section>
        )}

        {celebration && <p className="tutorial-celebration" role="status">✦ {celebration} 실제 자산이 아닌 Demo 보상입니다.</p>}
      </main>

      {rewardDialog && <TutorialRewardDialog kind={rewardDialog} saving={saving} onClaim={claimReward} onClose={() => setRewardDialog(null)} />}
    </div>
  );
}
