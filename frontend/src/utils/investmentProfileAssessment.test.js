import assert from 'node:assert/strict';
import test from 'node:test';
import { getInvestmentProfileQuestions } from '../data/investmentProfileQuestions.js';
import { assessInvestmentProfile } from './investmentProfileAssessment.js';

function answersAt(questions, indexByQuestion = {}) {
  return Object.fromEntries(
    questions.map((question) => {
      const index = indexByQuestion[question.id] ?? 2;
      return [question.id, question.options[index].id];
    }),
  );
}

test('기존 목표 기간이 있으면 투자기간을 다시 질문하지 않는다', () => {
  const withTargetYears = getInvestmentProfileQuestions({ targetYears: 5 });
  const withoutTargetYears = getInvestmentProfileQuestions({});

  assert.equal(withTargetYears.length, 7);
  assert.equal(withTargetYears.some((question) => question.id === 'investment_horizon'), false);
  assert.equal(withoutTargetYears.length, 8);
  assert.equal(withoutTargetYears.at(-1).id, 'investment_horizon');
});

test('같은 응답은 항상 같은 투자성향 결과를 만든다', () => {
  const userFinancialData = { age: 29, targetYears: 5 };
  const questions = getInvestmentProfileQuestions(userFinancialData);
  const answers = answersAt(questions);
  const input = { questions, answers, userFinancialData };

  assert.deepEqual(assessInvestmentProfile(input), assessInvestmentProfile(input));
  assert.equal(assessInvestmentProfile(input).key, 'neutral');
});

test('높은 위험 선호만으로 공격형이 되지 않고 감수능력 상한을 적용한다', () => {
  const userFinancialData = { age: 29, targetYears: 1 };
  const questions = getInvestmentProfileQuestions(userFinancialData);
  const answers = answersAt(questions, {
    purpose: 4,
    experience: 0,
    investable_share: 0,
    financial_buffer: 0,
    loss_tolerance: 4,
    return_preference: 4,
    market_drop: 4,
  });
  const result = assessInvestmentProfile({ questions, answers, userFinancialData });
  const order = ['stable', 'stable_seeking', 'neutral', 'aggressive', 'very_aggressive'];

  assert.ok(order.indexOf(result.key) <= order.indexOf('neutral'));
  assert.ok(result.reasons.some((reason) => reason.includes('보수적으로 조정')));
});

test('보수적 응답과 적극적 응답을 5단계 양 끝으로 구분한다', () => {
  const userFinancialData = { age: 29, targetYears: 10 };
  const questions = getInvestmentProfileQuestions(userFinancialData);
  const conservative = assessInvestmentProfile({
    questions,
    answers: answersAt(questions, Object.fromEntries(questions.map((question) => [question.id, 0]))),
    userFinancialData,
  });
  const adventurous = assessInvestmentProfile({
    questions,
    answers: answersAt(questions, Object.fromEntries(questions.map((question) => [question.id, 4]))),
    userFinancialData,
  });

  assert.equal(conservative.key, 'stable');
  assert.equal(adventurous.key, 'very_aggressive');
});

test('응답이 빠지면 결과를 산출하지 않는다', () => {
  const userFinancialData = { age: 29, targetYears: 5 };
  const questions = getInvestmentProfileQuestions(userFinancialData);
  const answers = answersAt(questions);
  delete answers[questions[0].id];

  assert.throws(
    () => assessInvestmentProfile({ questions, answers, userFinancialData }),
    /모든 투자성향 문항/,
  );
});

