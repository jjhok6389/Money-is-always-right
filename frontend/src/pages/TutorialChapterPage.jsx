import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import TutorialInteraction from '../components/TutorialInteraction';
import TutorialRewardDialog from '../components/TutorialRewardDialog';
import { getTutorialChapter, MIDPOINT_REWARDS, TUTORIAL_CHAPTERS } from '../data/tutorialChapters';
import useTutorialProgress from '../hooks/useTutorialProgress';
import { useAuth } from '../contexts/AuthContext';

const STEP_LABELS = ['개념', '사례', '체험', '퀴즈', '완료'];

function ChapterExperience({ chapter, profile, progressState }) {
  const { progress, saving, error, completeChapter, claimMidpoint } = progressState;
  const [step, setStep] = useState(0);
  const [interactionDone, setInteractionDone] = useState(false);
  const [answers, setAnswers] = useState({});
  const [quizChecked, setQuizChecked] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [midpointDialogOpen, setMidpointDialogOpen] = useState(false);
  const [claimedRewardLabel, setClaimedRewardLabel] = useState('');
  const chapterIndex = TUTORIAL_CHAPTERS.findIndex((item) => item.id === chapter.id);
  const nextChapter = TUTORIAL_CHAPTERS[chapterIndex + 1];
  const alreadyCompleted = Boolean(progress?.chapters?.[chapter.id]?.completed);
  const allAnswered = chapter.quiz.every((question) => answers[question.id] != null);
  const allCorrect = chapter.quiz.every((question) => answers[question.id] === question.answer);

  const selectAnswer = (questionId, optionIndex) => {
    setAnswers((current) => ({ ...current, [questionId]: optionIndex }));
    setQuizChecked(false);
  };

  const finishChapter = async () => {
    try {
      const updatedProgress = await completeChapter(chapter.id);
      setJustCompleted(true);
      if (chapter.number === 3 && !updatedProgress?.midpointReward?.claimed) {
        setMidpointDialogOpen(true);
      }
    } catch {
      // Error copy is rendered from the shared hook.
    }
  };

  const claimChapterReward = async (rewardId) => {
    try {
      await claimMidpoint(rewardId);
      const reward = MIDPOINT_REWARDS.find((item) => item.id === rewardId);
      setClaimedRewardLabel(reward?.label || '중간');
    } catch {
      // Error copy is rendered from the shared hook.
    }
  };

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="tutorial-concepts">
          {chapter.concepts.map(([term, description]) => (
            <article key={term}><strong>{term}</strong><p>{description}</p></article>
          ))}
        </div>
      );
    }
    if (step === 1) {
      return (
        <article className="tutorial-example">
          <p className="eyebrow">실제 상황으로 생각하기</p>
          <h2>{chapter.example.title}</h2>
          <p>{chapter.example.body}</p>
          <small>{chapter.example.note}</small>
        </article>
      );
    }
    if (step === 2) {
      return <TutorialInteraction chapterId={chapter.id} profile={profile} onComplete={() => setInteractionDone(true)} />;
    }
    if (step === 3) {
      return (
        <div className="tutorial-quiz">
          {chapter.quiz.map((question, questionIndex) => {
            const selected = answers[question.id];
            const correct = selected === question.answer;
            return (
              <fieldset key={question.id}>
                <legend>{questionIndex + 1}. {question.question}</legend>
                <div className="tutorial-quiz-options">
                  {question.options.map((option, optionIndex) => (
                    <label key={option} className={selected === optionIndex ? 'is-selected' : ''}>
                      <input type="radio" name={question.id} value={optionIndex} checked={selected === optionIndex} onChange={() => selectAnswer(question.id, optionIndex)} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                {quizChecked && <p className={correct ? 'tutorial-quiz-feedback is-correct' : 'tutorial-quiz-feedback is-wrong'}>{correct ? '정답입니다. ' : '다시 선택해보세요. '}{question.explanation}</p>}
              </fieldset>
            );
          })}
        </div>
      );
    }
    return (
      <div className="tutorial-complete-step">
        <span aria-hidden="true">✓</span>
        <h2>{justCompleted || alreadyCompleted ? '이 챕터를 이수했습니다' : '마지막으로 완료를 기록할까요?'}</h2>
        <p>배운 내용을 실제 금융 결정을 검토할 때 다시 떠올려보세요.</p>
        {!justCompleted && !alreadyCompleted ? (
          <button type="button" className="btn btn-primary" disabled={saving} onClick={finishChapter}>{saving ? '저장 중...' : '챕터 완료하기'}</button>
        ) : (
          <div className="hero-actions">
            {nextChapter ? <Link to={`/tutorial/${nextChapter.id}`} className="btn btn-primary">다음 챕터</Link> : <Link to="/tutorial" className="btn btn-primary">보상 확인하기</Link>}
            <Link to="/tutorial" className="btn btn-ghost">전체 목록</Link>
          </div>
        )}
      </div>
    );
  };

  const nextDisabled = step === 2 && !interactionDone;

  return (
    <>
      <div className="tutorial-stepper" aria-label="챕터 진행 단계">
        {STEP_LABELS.map((label, index) => <span key={label} className={`${index === step ? 'is-current' : ''}${index < step ? ' is-done' : ''}`}>{index < step ? '✓' : index + 1}<small>{label}</small></span>)}
      </div>
      <section className="tutorial-step-content">{renderStep()}</section>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {step < 4 && (
        <div className="tutorial-step-actions">
          <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>이전</button>
          {step === 3 ? (
            quizChecked && allCorrect
              ? <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>마무리로</button>
              : <button type="button" className="btn btn-primary" disabled={!allAnswered} onClick={() => setQuizChecked(true)}>정답 확인</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={nextDisabled} onClick={() => setStep((value) => Math.min(4, value + 1))}>{nextDisabled ? '체험을 먼저 진행해주세요' : '다음'}</button>
          )}
        </div>
      )}
      {midpointDialogOpen && (
        <TutorialRewardDialog
          kind="midpoint"
          saving={saving}
          chapterCompletion
          claimedRewardLabel={claimedRewardLabel}
          onClaim={claimChapterReward}
          onClose={() => setMidpointDialogOpen(false)}
        />
      )}
    </>
  );
}

export default function TutorialChapterPage() {
  const { chapterId } = useParams();
  const chapter = getTutorialChapter(chapterId);
  const { profile } = useAuth();
  const progressState = useTutorialProgress();

  if (!chapter) return <Navigate to="/tutorial" replace />;

  const chapterIndex = TUTORIAL_CHAPTERS.findIndex((item) => item.id === chapter.id);
  const previousChapter = TUTORIAL_CHAPTERS[chapterIndex - 1];
  const locked = previousChapter && progressState.progress && !progressState.progress.chapters?.[previousChapter.id]?.completed;

  return (
    <div className="page-shell tutorial-shell">
      <AppHeader />
      <main className="page-content page-content-xl tutorial-chapter-page">
        <Link to="/tutorial" className="tutorial-back-link">← 전체 튜토리얼</Link>
        <header className="tutorial-chapter-head">
          <p className="eyebrow">Chapter {chapter.number} · {chapter.duration}</p>
          <h1>{chapter.title}</h1>
          <p className="lead">{chapter.summary}</p>
        </header>

        {progressState.loading && <p className="muted">진행 상태를 불러오는 중...</p>}
        {progressState.error && !progressState.progress && (
          <div className="tutorial-load-error alert alert-error">
            <p>{progressState.error}</p>
            <button type="button" className="btn btn-secondary" onClick={progressState.refresh}>
              다시 불러오기
            </button>
          </div>
        )}
        {!progressState.loading && locked && (
          <section className="tutorial-locked-panel">
            <h2>이전 챕터를 먼저 완료해주세요</h2>
            <p>{previousChapter.title}을 완료하면 이 챕터가 열립니다.</p>
            <Link to={`/tutorial/${previousChapter.id}`} className="btn btn-primary">이전 챕터로</Link>
          </section>
        )}
        {!progressState.loading && !locked && progressState.progress && <ChapterExperience key={chapter.id} chapter={chapter} profile={profile} progressState={progressState} />}
      </main>
    </div>
  );
}
