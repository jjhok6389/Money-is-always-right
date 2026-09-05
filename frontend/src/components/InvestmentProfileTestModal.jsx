import { useEffect, useRef, useState } from 'react';
import {
  getInvestmentProfileQuestions,
  INVESTMENT_PROFILE_DISCLAIMER,
} from '../data/investmentProfileQuestions';
import { assessInvestmentProfile } from '../utils/investmentProfileAssessment';

function profileContextDescription(data) {
  const age = Number(data?.age);
  const targetYears = Number(data?.targetYears);
  const fields = [];
  if (Number.isFinite(age) && age > 0) fields.push('나이');
  if (Number.isFinite(targetYears) && targetYears > 0) fields.push('목표 기간');
  if (fields.length === 0) return null;
  return `이미 입력한 ${fields.join('와 ')}은 다시 묻지 않고 위험 감수능력 판단에 보조적으로 반영해요.`;
}

export default function InvestmentProfileTestModal({
  onClose,
  onSelectResult,
  userFinancialData = {},
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [stage, setStage] = useState('intro');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const questions = getInvestmentProfileQuestions(userFinancialData);
  const profileContextNote = profileContextDescription(userFinancialData);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const currentQuestion = questions[questionIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : null;
  const progress = questions.length > 0
    ? Math.round(((questionIndex + 1) / questions.length) * 100)
    : 0;

  const startTest = () => {
    setStage('questions');
    setQuestionIndex(0);
  };

  const goPrevious = () => {
    if (questionIndex === 0) {
      setStage('intro');
      return;
    }
    setQuestionIndex((previous) => previous - 1);
  };

  const goNext = () => {
    if (!currentQuestion || !currentAnswer) return;
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((previous) => previous + 1);
      return;
    }
    setResult(assessInvestmentProfile({ questions, answers, userFinancialData }));
    setStage('result');
  };

  const restart = () => {
    setAnswers({});
    setResult(null);
    setQuestionIndex(0);
    setStage('questions');
  };

  const applyResult = () => {
    if (!result) return;
    onSelectResult(result.key);
    onClose();
  };

  return (
    <div className="modal-backdrop investment-profile-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal-panel investment-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="investment-profile-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="investment-profile-modal-header">
          <div>
            <p className="investment-profile-kicker">간이 투자성향 진단</p>
            <h2 id="investment-profile-modal-title">내 투자성향 알아보기</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="investment-profile-close"
            aria-label="투자성향 진단 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {stage === 'intro' && (
          <div className="investment-profile-intro">
            <strong>약 1~2분이면 확인할 수 있어요.</strong>
            <p>
              원하는 수익 수준뿐 아니라 투자 경험, 손실을 견딜 수 있는 여건과 시장 하락 시의
              행동을 함께 살펴봅니다.
            </p>
            {profileContextNote && (
              <p className="investment-profile-context-note">
                {profileContextNote}
              </p>
            )}
            <button type="button" className="btn btn-primary" onClick={startTest}>
              진단 시작
            </button>
          </div>
        )}

        {stage === 'questions' && currentQuestion && (
          <div className="investment-profile-question-stage">
            <div
              className="investment-profile-progress"
              role="progressbar"
              aria-valuemin="1"
              aria-valuemax={questions.length}
              aria-valuenow={questionIndex + 1}
              aria-valuetext={`${questionIndex + 1} / ${questions.length}`}
            >
              <span>{questionIndex + 1} / {questions.length}</span>
              <div className="investment-profile-progress-track" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="investment-profile-question-copy">
              <h3>{currentQuestion.title}</h3>
              <p>{currentQuestion.description}</p>
            </div>

            <div className="investment-profile-options" role="radiogroup" aria-label={currentQuestion.title}>
              {currentQuestion.options.map((option) => {
                const selected = currentAnswer === option.id;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    key={option.id}
                    className={selected ? 'is-selected' : ''}
                    onClick={() => setAnswers((previous) => ({
                      ...previous,
                      [currentQuestion.id]: option.id,
                    }))}
                  >
                    <span className="investment-profile-radio" aria-hidden="true" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="investment-profile-actions">
              <button type="button" className="btn btn-ghost" onClick={goPrevious}>이전</button>
              <button type="button" className="btn btn-primary" disabled={!currentAnswer} onClick={goNext}>
                {questionIndex === questions.length - 1 ? '결과 확인' : '다음'}
              </button>
            </div>
          </div>
        )}

        {stage === 'result' && result && (
          <div className="investment-profile-result" aria-live="polite">
            <p>나의 투자성향은</p>
            <h3>{result.label}</h3>
            <p className="investment-profile-result-description">{result.description}</p>

            <dl className="investment-profile-metrics">
              {result.metrics.map((metric) => (
                <div key={metric.key}>
                  <dt>{metric.label}</dt>
                  <dd aria-label={`${metric.level} / 5`}>
                    {Array.from({ length: 5 }, (_, index) => (
                      <span
                        key={index}
                        className={index < metric.level ? 'is-active' : ''}
                        aria-hidden="true"
                      />
                    ))}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="investment-profile-reasons">
              <strong>이렇게 판단했어요</strong>
              <ul>
                {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>

            <div className="investment-profile-result-actions">
              <button type="button" className="btn btn-ghost" onClick={restart}>다시 테스트</button>
              <button type="button" className="btn btn-primary" onClick={applyResult}>
                이 성향으로 선택하기
              </button>
            </div>
          </div>
        )}

        <p className="investment-profile-disclaimer">{INVESTMENT_PROFILE_DISCLAIMER}</p>
      </section>
    </div>
  );
}
