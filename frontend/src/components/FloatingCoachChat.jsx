import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sendCoachMessage } from '../services/coachService';

const WELCOME =
  '안녕하세요! AI 금융 코치입니다. 상품 비교, 가입 적합성, 로드맵 실행에 대해 한국어로 물어보세요.';

export default function FloatingCoachChat() {
  const { user, profile, isOnboarded } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }]);
  const [suggestions, setSuggestions] = useState([
    '내 목표 달성까지 얼마나 걸릴까?',
    '안정형에게 맞는 적금 추천해줘',
    '변동비를 줄이려면 어디부터 줄일까?',
  ]);
  const [sending, setSending] = useState(false);
  const [source, setSource] = useState(null);
  const listRef = useRef(null);

  const hideOnReport =
    location.pathname.startsWith('/coach-report') ||
    location.pathname.startsWith('/reports/play');

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  if (!user || !isOnboarded || hideOnReport) {
    return null;
  }

  const ask = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const history = messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-10);

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);

    try {
      const response = await sendCoachMessage({
        message: trimmed,
        history,
        profile: profile
          ? {
              displayName: profile.displayName,
              age: profile.age,
              occupation: profile.occupation,
              investmentPropensity: profile.investmentPropensity,
              targetAssetAmount: profile.targetAssetAmount,
              targetYears: profile.targetYears,
              goalDescription: profile.goalDescription,
            }
          : null,
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.reply, toolTrace: response.toolTrace ?? [] },
      ]);
      setSource(response.source);
      if (response.suggestions?.length) {
        setSuggestions(response.suggestions);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err.message || '일시적으로 답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    ask(input);
  };

  return (
    <div className="coach-root">
      {open && (
        <section className="coach-panel" aria-label="AI 금융 코치 채팅">
          <header className="coach-header">
            <div>
              <strong>AI 금융 코치</strong>
              <p>
                {source === 'bedrock'
                  ? 'AWS Bedrock 연결됨'
                  : source === 'fallback'
                    ? '로컬 안내 모드'
                    : '상품·로드맵 상담'}
              </p>
            </div>
            <button type="button" className="coach-close" onClick={() => setOpen(false)} aria-label="닫기">
              ×
            </button>
          </header>

          <div className="coach-messages" ref={listRef}>
            {messages.map((item, index) => (
              <Fragment key={`${item.role}-${index}`}>
                {item.toolTrace?.length > 0 && (
                  <div className="coach-steps" aria-label="에이전트 실행 단계">
                    {item.toolTrace.map((step, stepIndex) => (
                      <span
                        key={`${step.name}-${stepIndex}`}
                        className={`coach-step ${step.status === 'error' ? 'error' : ''}`}
                        title={step.summary}
                      >
                        <span className="coach-step-label">{step.label}</span>
                        {step.status === 'error' ? '!' : '✓'}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`coach-bubble ${item.role === 'user' ? 'user' : 'assistant'}`}>
                  {item.content}
                </div>
              </Fragment>
            ))}
            {sending && <div className="coach-bubble assistant">금융 데이터를 조회하고 답변을 만드는 중...</div>}
          </div>

          <div className="coach-suggestions">
            {suggestions.map((item) => (
              <button key={item} type="button" onClick={() => ask(item)} disabled={sending}>
                {item}
              </button>
            ))}
          </div>

          <form className="coach-form" onSubmit={onSubmit}>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="궁금한 점을 입력하세요"
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
              전송
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="coach-fab"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        {open ? '닫기' : 'AI 코치'}
      </button>
    </div>
  );
}
