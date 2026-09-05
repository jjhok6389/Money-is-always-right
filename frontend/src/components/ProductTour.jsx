import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { PRODUCT_TOUR_STEPS } from '../data/productTourSteps';
import { useAuth } from '../contexts/AuthContext';
import { saveUserProfile } from '../services/userService';

const SPOT_PAD = 10;
const VIEW_MARGIN = 16;
const GAP = 14;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function findVisible(selector) {
  if (!selector) return null;
  // Support comma-separated fallbacks, e.g. current card then panel.
  const selectors = String(selector)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of selectors) {
    const match = Array.from(document.querySelectorAll(part)).find((node) => {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    });
    if (match) return match;
  }
  return null;
}

function measureTarget(selector) {
  const el = findVisible(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;

  // Tall sections (금융 로드맵) otherwise punch a hole bigger than the viewport,
  // so the dim overlay disappears and the highlight looks "broken".
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visibleTop = Math.max(rect.top, 0);
  const visibleLeft = Math.max(rect.left, 0);
  const visibleBottom = Math.min(rect.bottom, vh);
  const visibleRight = Math.min(rect.right, vw);
  const width = visibleRight - visibleLeft;
  const height = visibleBottom - visibleTop;
  if (width < 2 || height < 2) return null;

  return {
    top: visibleTop - SPOT_PAD,
    left: visibleLeft - SPOT_PAD,
    width: width + SPOT_PAD * 2,
    height: height + SPOT_PAD * 2,
  };
}

/** Keep the tour card fully inside the viewport. */
function placeCard(spot, cardWidth, cardHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxLeft = Math.max(VIEW_MARGIN, vw - cardWidth - VIEW_MARGIN);
  const maxTop = Math.max(VIEW_MARGIN, vh - cardHeight - VIEW_MARGIN);

  if (!spot) {
    return {
      top: clamp((vh - cardHeight) / 2, VIEW_MARGIN, maxTop),
      left: clamp((vw - cardWidth) / 2, VIEW_MARGIN, maxLeft),
    };
  }

  const space = {
    below: vh - (spot.top + spot.height) - VIEW_MARGIN,
    above: spot.top - VIEW_MARGIN,
    right: vw - (spot.left + spot.width) - VIEW_MARGIN,
    left: spot.left - VIEW_MARGIN,
  };

  const candidates = [
    {
      id: 'below',
      fits: space.below >= cardHeight + GAP,
      top: spot.top + spot.height + GAP,
      left: spot.left + spot.width / 2 - cardWidth / 2,
      score: space.below,
    },
    {
      id: 'above',
      fits: space.above >= cardHeight + GAP,
      top: spot.top - GAP - cardHeight,
      left: spot.left + spot.width / 2 - cardWidth / 2,
      score: space.above,
    },
    {
      id: 'right',
      fits: space.right >= cardWidth + GAP,
      top: spot.top + spot.height / 2 - cardHeight / 2,
      left: spot.left + spot.width + GAP,
      score: space.right + 40, // prefer side placement for narrow left targets (nav)
    },
    {
      id: 'left',
      fits: space.left >= cardWidth + GAP,
      top: spot.top + spot.height / 2 - cardHeight / 2,
      left: spot.left - GAP - cardWidth,
      score: space.left,
    },
  ];

  // Sidebar / left-edge targets: strongly prefer right of highlight.
  const nearLeftEdge = spot.left < 120;
  if (nearLeftEdge) {
    const right = candidates.find((c) => c.id === 'right');
    if (right) right.score += 200;
  }

  const fitting = candidates.filter((c) => c.fits).sort((a, b) => b.score - a.score);
  const chosen =
    fitting[0] ||
    [...candidates].sort((a, b) => b.score - a.score)[0];

  // Last resort: pin to bottom-right safe zone (fully on-screen).
  if (!chosen.fits) {
    return {
      top: maxTop,
      left: maxLeft,
    };
  }

  return {
    top: clamp(chosen.top, VIEW_MARGIN, maxTop),
    left: clamp(chosen.left, VIEW_MARGIN, maxLeft),
  };
}

export default function ProductTour({
  ready,
  steps,
  active: activeProp,
  stepIndex: stepIndexProp,
  onDismiss,
  onStepChange,
  modifier = '',
}) {
  const { user, profile, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const forceTour = searchParams.get('tour') === '1';
  const [localDismiss, setLocalDismiss] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const tourSteps = steps || PRODUCT_TOUR_STEPS;
  const [spot, setSpot] = useState(null);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const [cardReady, setCardReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const cardRef = useRef(null);

  const dashboardActive =
    Boolean(ready) &&
    Boolean(user) &&
    Boolean(profile?.onboardingCompleted) &&
    !localDismiss &&
    (forceTour || !profile?.productTourDismissed);
  const active = activeProp ?? dashboardActive;

  const currentStepIndex = stepIndexProp ?? stepIndex;
  const safeIndex = Math.min(Math.max(currentStepIndex, 0), tourSteps.length - 1);
  const step = tourSteps[safeIndex];
  const isLast = safeIndex >= tourSteps.length - 1;

  useLayoutEffect(() => {
    if (!active) return undefined;
    const previouslyFocused = document.activeElement;
    cardRef.current?.focus();
    const focusFrame = window.requestAnimationFrame(() => cardRef.current?.focus());
    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll('button:not([disabled])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trapFocus);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', trapFocus);
      previouslyFocused?.focus?.();
    };
  }, [active, safeIndex]);

  useLayoutEffect(() => {
    if (!active || !step) return undefined;

    const updateSpot = () => {
      setSpot(measureTarget(step.target));
    };

    const scrollTarget = () => {
      if (!step.target) return;
      findVisible(step.target)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
        inline: 'nearest',
      });
    };

    scrollTarget();
    updateSpot();
    const retryMs = [80, 200, 360, 560, 900, 1400];
    const timers = retryMs.map((ms) => window.setTimeout(updateSpot, ms));

    let targetRo = null;
    const observeTarget = () => {
      const targetEl = step.target ? findVisible(step.target) : null;
      if (typeof ResizeObserver === 'undefined') return;
      targetRo?.disconnect();
      targetRo = new ResizeObserver(updateSpot);
      if (targetEl) {
        targetRo.observe(targetEl);
        const pageContent = targetEl.closest('.page-content, .page-shell, .side-nav');
        if (pageContent && pageContent !== targetEl) targetRo.observe(pageContent);
      }
    };
    observeTarget();
    const observeTimer = window.setTimeout(observeTarget, 400);

    window.addEventListener('resize', updateSpot);
    window.addEventListener('scroll', updateSpot, true);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(observeTimer);
      targetRo?.disconnect();
      window.removeEventListener('resize', updateSpot);
      window.removeEventListener('scroll', updateSpot, true);
    };
  }, [active, step]);

  useLayoutEffect(() => {
    if (!active) return undefined;
    setCardReady(false);

    const reposition = () => {
      const card = cardRef.current;
      if (!card) return;
      const { width, height } = card.getBoundingClientRect();
      const w = Math.ceil(width) || Math.min(360, window.innerWidth - 32);
      const h = Math.ceil(height) || 200;
      const next = placeCard(spot, w, h);
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      next.top = clamp(next.top, VIEW_MARGIN, Math.max(VIEW_MARGIN, vh - h - VIEW_MARGIN));
      next.left = clamp(next.left, VIEW_MARGIN, Math.max(VIEW_MARGIN, vw - w - VIEW_MARGIN));
      setCardPos((prev) =>
        prev.top === next.top && prev.left === next.left ? prev : next,
      );
      setCardReady(true);
    };

    reposition();
    const t = window.setTimeout(reposition, 50);
    const t2 = window.setTimeout(reposition, 340);
    window.addEventListener('resize', reposition);

    const card = cardRef.current;
    const ro = card && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reposition) : null;
    if (card && ro) ro.observe(card);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.removeEventListener('resize', reposition);
      ro?.disconnect();
    };
  }, [active, spot, safeIndex, step]);

  const dismiss = async () => {
    if (saving) return;
    setSaving(true);
    setLocalDismiss(true);
    if (forceTour) {
      const next = new URLSearchParams(searchParams);
      next.delete('tour');
      setSearchParams(next, { replace: true });
    }
    try {
      const { updatedAt: _ignored, ...profileRest } = profile || {};
      await saveUserProfile(user.uid, {
        ...profileRest,
        productTourDismissed: true,
        createdAt: profile?.createdAt || new Date().toISOString(),
      });
      await refreshProfile();
    } catch (err) {
      console.warn('Product tour dismiss save failed:', err.message);
    } finally {
      setSaving(false);
    }
  };

  const dismissExternal = () => {
    setLocalDismiss(true);
    onDismiss?.();
  };

  const changeStep = (nextIndex) => {
    const next = Math.min(Math.max(nextIndex, 0), tourSteps.length - 1);
    if (stepIndexProp == null) setStepIndex(next);
    onStepChange?.(next);
  };

  const goNext = () => {
    if (isLast) {
      if (onDismiss) dismissExternal();
      else dismiss();
      return;
    }
    changeStep(Math.min(safeIndex + 1, tourSteps.length - 1));
  };

  const goPrev = () => {
    changeStep(Math.max(safeIndex - 1, 0));
  };

  if (!active || !step || typeof document === 'undefined') return null;

  return createPortal(
    <div className={`product-tour${modifier ? ` ${modifier}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="product-tour-title">
      {!spot && <div className="product-tour-mask" aria-hidden="true" />}
      {spot && (
        <div
          className="product-tour-spotlight"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={cardRef}
        tabIndex="-1"
        className={`product-tour-card${cardReady ? '' : ' is-placing'}`}
        style={{
          top: cardPos.top,
          left: cardPos.left,
          transform: 'none',
        }}
      >
        <p className="product-tour-step">
          {safeIndex + 1} / {tourSteps.length}
        </p>
        <h2 id="product-tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="product-tour-actions">
          <button
            type="button"
            className="btn btn-ghost product-tour-dismiss"
            onClick={onDismiss ? dismissExternal : dismiss}
            disabled={saving}
          >
            다시 보지 않기
          </button>
          <div className="product-tour-nav">
            {safeIndex > 0 && (
              <button type="button" className="btn btn-ghost" onClick={goPrev} disabled={saving}>
                이전
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={goNext} disabled={saving}>
              {isLast ? '완료' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
