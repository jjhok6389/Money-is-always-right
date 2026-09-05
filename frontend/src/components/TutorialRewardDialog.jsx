import { useState } from 'react';
import { FINAL_REWARD, MIDPOINT_REWARDS } from '../data/tutorialChapters';

export default function TutorialRewardDialog({ kind, saving, onClaim, onClose, chapterCompletion = false, claimedRewardLabel = '' }) {
  const [selectedReward, setSelectedReward] = useState(MIDPOINT_REWARDS[0].id);
  const isFinal = kind === 'final';
  const rewardClaimed = Boolean(claimedRewardLabel);

  return (
    <div className="modal-backdrop tutorial-reward-backdrop" role="presentation">
      <section className="modal-panel tutorial-reward-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-reward-title" aria-live="polite">
        <p className="tutorial-reward-mark" aria-hidden="true">{isFinal ? '◆' : '✦'}</p>
        <p className="eyebrow">Demo 보상</p>
        <h2 id="tutorial-reward-title">
          {rewardClaimed
            ? chapterCompletion ? '챕터 3 완료! 보상이 지급되었어요!' : '보상이 지급되었어요!'
            : isFinal ? '6개 챕터를 모두 완료했어요' : chapterCompletion ? '챕터 3 완료!' : '절반을 완주했어요'}
        </h2>
        <p className="muted">
          {rewardClaimed
            ? `${claimedRewardLabel} Demo 보상이 저장되었습니다.`
            : isFinal ? `${FINAL_REWARD.label}를 Demo 자산으로 받을 수 있습니다.` : '중간 보상이 열렸어요. 원하는 Demo 쿠폰 하나를 선택해보세요.'}
        </p>

        {!isFinal && !rewardClaimed && (
          <div className="tutorial-reward-options">
            {MIDPOINT_REWARDS.map((reward) => (
              <button type="button" key={reward.id} className={selectedReward === reward.id ? 'is-selected' : ''} onClick={() => setSelectedReward(reward.id)}>
                <span aria-hidden="true">{reward.icon}</span>
                {reward.label}
              </button>
            ))}
          </div>
        )}

        <p className="tutorial-demo-disclaimer">실제 쿠폰·ETF·금융상품이 지급되지 않는 해커톤 Demo 보상입니다.</p>
        <div className={`tutorial-reward-actions${rewardClaimed ? ' is-complete' : ''}`}>
          {rewardClaimed ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>확인</button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onClaim(isFinal ? FINAL_REWARD.id : selectedReward)}>
                {saving ? '저장 중...' : 'Demo 보상 받기'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>나중에 받기</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
