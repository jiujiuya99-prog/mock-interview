const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function callDeepSeek(messages, { jsonMode = false, temperature = 0.7 } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('未配置 DEEPSEEK_API_KEY');
  }

  const body = {
    model: MODEL,
    messages,
    stream: false,
    temperature,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek API 错误 ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content) {
    throw new Error('DeepSeek 返回了空内容');
  }
  return content;
}

function extractJson(content) {
  try {
    return JSON.parse(content);
  } catch (e) {
    const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        throw new Error('无法解析 AI 返回的 JSON');
      }
    }
    throw new Error('AI 返回内容不是有效 JSON');
  }
}

async function generateQuestions({ resumeText, company, role, jd }) {
  const system = '你是一位资深技术面试官，负责根据候选人的简历和岗位要求设计面试题。请严格输出 JSON。';
  const user = [
    '请根据以下信息，设计 5 道面试题，覆盖：自我介绍、项目/技术深挖、行为与软技能、岗位匹配、职业规划等方向。',
    '题目要针对该候选人的具体经历和目标岗位，避免通用套话。',
    '',
    `目标公司：${company || '未知'}`,
    `目标岗位：${role || '未知'}`,
    `岗位要求(JD)：${jd || '未提供'}`,
    '',
    `候选人简历：\n${resumeText || '未提供'}`,
    '',
    '请严格按以下 JSON 格式输出（不要输出任何其他文字）：',
    '{"questions":[{"id":1,"text":"题目内容"},{"id":2,"text":"题目内容"}]}',
    '共 5 道题，id 从 1 到 5。',
  ].join('\n');

  const content = await callDeepSeek(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { jsonMode: true, temperature: 0.8 }
  );

  const parsed = extractJson(content);
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('AI 生成的题目为空');
  }
  return questions
    .slice(0, 5)
    .map((q, i) => ({
      id: i + 1,
      text: (q.text || q.question || String(q)).trim(),
    }));
}

async function evaluateInterview({ resumeText, company, role, questions, answers }) {
  const system = '你是一位专业面试官，负责对候选人的面试表现进行评分和点评。请严格输出 JSON。';
  const qa = questions.map((q, i) => {
    const a = answers[i] || '（未回答）';
    return `第${q.id}题：${q.text}\n回答：${a}`;
  }).join('\n\n');

  const user = [
    '请根据以下面试信息，对候选人进行全面评分。',
    '',
    `目标公司：${company || '未知'}`,
    `目标岗位：${role || '未知'}`,
    '',
    `候选人简历：\n${resumeText || '未提供'}`,
    '',
    '面试问答记录：',
    qa,
    '',
    '请严格按以下 JSON 格式输出（不要输出任何其他文字）：',
    JSON.stringify({
      overall_score: 0,
      dimensions: [
        { name: '专业知识', score: 0, comment: '简短点评' },
        { name: '项目经验', score: 0, comment: '简短点评' },
        { name: '逻辑表达', score: 0, comment: '简短点评' },
        { name: '沟通表达', score: 0, comment: '简短点评' },
        { name: '岗位匹配', score: 0, comment: '简短点评' },
      ],
      strengths: ['优势1', '优势2'],
      weaknesses: ['不足1', '不足2'],
      suggestions: ['改进建议1', '改进建议2'],
      summary: '总体评语（一段话）',
      per_question: [{ id: 1, comment: '该题点评' }],
    }),
    '',
    '要求：overall_score 与各维度 score 为 0-100 的整数；per_question 为每一道题的点评，id 与题目对应。',
  ].join('\n');

  const content = await callDeepSeek(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { jsonMode: true, temperature: 0.5 }
  );

  return extractJson(content);
}

module.exports = { generateQuestions, evaluateInterview, callDeepSeek };
