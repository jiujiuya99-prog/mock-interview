// ============ 全局状态 ============
const state = {
  user: null,
  cameraStream: null,
  audioStream: null,
  cameraReady: false,
  micReady: false,
  resumeText: '',
  company: '',
  role: '',
  jd: '',
  questions: [],
  answers: [],
  currentQuestion: 0,
  listening: false,
  recognition: null,
  finalTranscript: '',
  timerInterval: null,
  remainingSeconds: 120,
};

const QUESTION_TIME = 120; // 每题 120 秒

// ============ 工具 ============
function $(id) { return document.getElementById(id); }

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + name).classList.add('active');
  window.scrollTo(0, 0);
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ============ 认证 ============
async function checkAuth() {
  try {
    state.user = await api('/api/auth/me');
    $('navEmail').textContent = state.user.email;
    $('navAvatar').textContent = state.user.email.charAt(0).toUpperCase();
  } catch (e) {
    location.href = '/login.html';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login.html';
}

// ============ 设备检测 ============
async function detectCamera() {
  const btn = $('cameraBtn');
  btn.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    state.cameraStream = stream;
    state.cameraReady = true;
    setDeviceStatus('camera', true);
    const video = $('cameraPreview');
    video.srcObject = stream;
    video.classList.remove('hidden');
    $('cameraPlaceholder').classList.add('hidden');
  } catch (e) {
    state.cameraReady = false;
    setDeviceStatus('camera', false);
    showToast('无法访问摄像头：' + (e.name === 'NotAllowedError' ? '权限被拒绝' : e.message), 'error');
  } finally {
    btn.disabled = false;
    updateReadyState();
  }
}

async function detectMic() {
  const btn = $('micBtn');
  btn.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioStream = stream;
    state.micReady = true;
    setDeviceStatus('mic', true);
    $('micHintText').textContent = '说话以测试麦克风';
    startMicVisualizer(stream);
  } catch (e) {
    state.micReady = false;
    setDeviceStatus('mic', false);
    $('micHintText').textContent = '麦克风未开启';
    showToast('无法访问麦克风：' + (e.name === 'NotAllowedError' ? '权限被拒绝' : e.message), 'error');
  } finally {
    btn.disabled = false;
    updateReadyState();
  }
}

function setDeviceStatus(kind, ok) {
  const statusEl = $(kind === 'camera' ? 'cameraStatus' : 'micStatus');
  const panelEl = $(kind === 'camera' ? 'cameraPanel' : 'micPanel');
  statusEl.textContent = ok ? '已开启' : '未开启';
  statusEl.className = 'device-status ' + (ok ? 'ok' : 'fail');
  panelEl.classList.toggle('ok', ok);
  panelEl.classList.toggle('fail', !ok);
}

function startMicVisualizer(stream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const wave = $('micWave');
    function loop() {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      wave.style.opacity = avg > 12 ? '1' : '0.2';
      requestAnimationFrame(loop);
    }
    loop();
  } catch (e) {}
}

// ============ 就绪状态 ============
function updateReadyState() {
  const btn = $('enterBtn');
  const hint = $('enterHint');
  const missing = [];
  if (!state.cameraReady) missing.push('摄像头');
  if (!state.micReady) missing.push('麦克风');
  if (!state.resumeText.trim()) missing.push('简历');
  if (!state.company.trim()) missing.push('公司名称');
  if (!state.role.trim()) missing.push('目标岗位');

  const deviceOk = state.cameraReady && state.micReady;
  const deviceHint = $('deviceHint');
  deviceHint.textContent = deviceOk ? '设备已就绪' : '需同时开启摄像头和麦克风';
  deviceHint.className = 'tag ' + (deviceOk ? 'tag-success' : 'tag-warning');

  if (missing.length === 0) {
    btn.disabled = false;
    hint.textContent = '准备就绪，点击开始面试';
  } else {
    btn.disabled = true;
    hint.textContent = '还缺少：' + missing.join('、');
  }
}

// ============ 简历 ============
async function handleResumeFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'docx', 'txt'].includes(ext)) {
    showToast('不支持的文件格式，请使用 PDF、DOCX 或 TXT', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('文件大小不能超过 10MB', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  showToast('正在解析简历...', 'info');
  try {
    const data = await api('/api/resume/parse', { method: 'POST', body: formData });
    state.resumeText = data.text;
    $('resumeTextInput').value = data.text;
    $('fileName').textContent = file.name;
    $('fileInfo').classList.add('visible');
    showToast('简历解析成功', 'success');
    updateReadyState();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    e.target.value = '';
  }
}

function onResumeTextInput() {
  state.resumeText = $('resumeTextInput').value;
  updateReadyState();
}

function onCompanyInput() {
  state.company = $('companyInput').value.trim();
  updateReadyState();
}
function onRoleInput() {
  state.role = $('roleInput').value.trim();
  updateReadyState();
}
function onJdInput() {
  state.jd = $('jdInput').value.trim();
}

// ============ 进入面试 ============
async function enterInterview() {
  const btn = $('enterBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 正在生成题目...';
  try {
    const data = await api('/api/interview/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeText: state.resumeText,
        company: state.company,
        role: state.role,
        jd: state.jd,
      }),
    });
    state.questions = data.questions;
    state.answers = new Array(state.questions.length).fill('');
    state.currentQuestion = 0;
    startInterview();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🚀 生成题目并进入面试';
  }
}

function startInterview() {
  showPage('interview');
  const myVideo = $('myVideo');
  if (state.cameraStream) myVideo.srcObject = state.cameraStream;
  $('interviewerRole').textContent = `技术面试 · ${state.role || '目标岗位'}`;
  showQuestion(0);
  speakQuestion(state.questions[0].text);
}

// ============ 题目展示 ============
function showQuestion(i) {
  state.currentQuestion = i;
  $('questionLabel').textContent = `第 ${i + 1} 题 / 共 ${state.questions.length} 题`;
  $('questionText').textContent = state.questions[i].text;
  $('transcriptBox').textContent = state.answers[i] || '点击「开始回答」后，说出你的答案，这里会实时转写。';
  $('transcriptBox').classList.remove('listening');
  resetAnswerButton();
  startTimer();
}

// ============ 计时器 ============
function startTimer() {
  clearInterval(state.timerInterval);
  state.remainingSeconds = QUESTION_TIME;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.remainingSeconds--;
    updateTimerDisplay();
    if (state.remainingSeconds <= 0) {
      clearInterval(state.timerInterval);
      showToast('本题时间到', 'info');
      nextQuestion();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.remainingSeconds / 60);
  const s = state.remainingSeconds % 60;
  const display = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const el = $('questionTimer');
  el.textContent = display;
  el.className = 'control-timer' + (state.remainingSeconds <= 20 ? ' danger' : state.remainingSeconds <= 60 ? ' warning' : '');
  const pct = (state.remainingSeconds / QUESTION_TIME) * 100;
  $('questionProgress').style.width = pct + '%';
}

// ============ TTS 播报 ============
function speakQuestion(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 1;
  const avatar = $('interviewerAvatar');
  const wave = $('speakingWave');
  avatar.classList.add('speaking');
  wave.classList.remove('hidden');
  utter.onend = () => { avatar.classList.remove('speaking'); wave.classList.add('hidden'); };
  utter.onerror = () => { avatar.classList.remove('speaking'); wave.classList.add('hidden'); };
  window.speechSynthesis.speak(utter);
}

function replayQuestion() {
  speakQuestion(state.questions[state.currentQuestion].text);
}

// ============ ASR 语音识别 ============
function toggleAnswer() {
  if (state.listening) stopListening();
  else startListening();
}

function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('当前浏览器不支持语音识别，请使用 Chrome', 'error');
    return;
  }
  const recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;
  state.recognition = recognition;
  state.listening = true;
  state.finalTranscript = state.answers[state.currentQuestion] || '';

  $('answerBtn').textContent = '⏹ 停止回答';
  $('answerBtn').className = 'btn btn-danger';
  const box = $('transcriptBox');
  box.classList.add('listening');
  box.textContent = state.finalTranscript || '请开始说话...';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) state.finalTranscript += r[0].transcript;
      else interim += r[0].transcript;
    }
    box.textContent = (state.finalTranscript + interim) || '请开始说话...';
  };
  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      showToast('麦克风权限被拒绝', 'error');
    } else if (e.error !== 'aborted') {
      showToast('语音识别错误：' + e.error, 'error');
    }
  };
  recognition.onend = () => {
    if (state.listening) {
      try { recognition.start(); } catch (e) {}
    }
  };
  recognition.start();
}

function stopListening() {
  state.listening = false;
  if (state.recognition) {
    try { state.recognition.stop(); } catch (e) {}
  }
  const text = state.finalTranscript.trim();
  if (text) state.answers[state.currentQuestion] = text;
  $('transcriptBox').textContent = text || '（本次未记录到有效回答）';
  $('transcriptBox').classList.remove('listening');
  resetAnswerButton();
  $('nextBtn').disabled = false;
}

function resetAnswerButton() {
  $('answerBtn').textContent = '🎤 开始回答';
  $('answerBtn').className = 'btn btn-primary';
}

// ============ 下一题 / 结束 ============
function nextQuestion() {
  if (state.listening) stopListening();
  clearInterval(state.timerInterval);
  if (state.currentQuestion < state.questions.length - 1) {
    state.currentQuestion++;
    showQuestion(state.currentQuestion);
    speakQuestion(state.questions[state.currentQuestion].text);
  } else {
    endInterview();
  }
}

async function endInterview() {
  if (state.listening) stopListening();
  clearInterval(state.timerInterval);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  showPage('result');
  $('summaryText').textContent = '正在生成评分报告...';
  $('heroScore').textContent = '--';
  $('radarChart').innerHTML = '';
  $('dimensionAnalysis').innerHTML = '';
  $('strengthsList').innerHTML = '';
  $('weaknessesList').innerHTML = '';
  $('suggestionsList').innerHTML = '';
  $('perQuestionList').innerHTML = '';
  $('resultMeta').textContent = '';

  try {
    const data = await api('/api/interview/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeText: state.resumeText,
        company: state.company,
        role: state.role,
        jd: state.jd,
        questions: state.questions,
        answers: state.answers,
      }),
    });
    renderResult(data.report);
  } catch (e) {
    $('summaryText').textContent = '评分失败：' + e.message;
    showToast(e.message, 'error');
  }
  loadHistory();
}

// ============ 结果渲染 ============
function renderRadar(dims) {
  const svg = $('radarChart');
  if (!svg) return;
  const values = (dims || []).map(d => Number(d.score) || 0);
  const labels = (dims || []).map(d => d.name);
  const n = values.length;
  if (n < 3) return;

  const cx = 150, cy = 150, R = 102;
  const angle = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const point = (i, r) => {
    const a = angle(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  let s = '';

  for (const lv of [1, 0.75, 0.5, 0.25]) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = point(i, R * lv);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    s += `<polygon points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  }

  for (let i = 0; i < n; i++) {
    const [x, y] = point(i, R);
    s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  }

  const dataPts = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = point(i, R * (values[i] / 100));
    dataPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  s += `<polygon points="${dataPts.join(' ')}" fill="rgba(99,102,241,0.3)" stroke="#818CF8" stroke-width="2"/>`;

  for (let i = 0; i < n; i++) {
    const [x, y] = point(i, R * (values[i] / 100));
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#A5B4FC"/>`;
  }

  for (let i = 0; i < n; i++) {
    const [x, y] = point(i, R + 22);
    const anchor = x < cx - 10 ? 'end' : x > cx + 10 ? 'start' : 'middle';
    s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" fill="#9CA3AF" font-size="12">${labels[i]} ${values[i]}</text>`;
  }

  svg.innerHTML = s;
}

function renderResult(report) {
  const dims = report.dimensions || [];
  const overall = Number(report.overall_score) || 0;

  $('resultMeta').textContent = `应聘 ${state.company || '公司'} · ${state.role || '岗位'} · 共 ${state.questions.length} 题`;
  $('heroMetaText').textContent = `应聘 ${state.company || '公司'} · ${state.role || '岗位'} · 共 ${state.questions.length} 题`;

  $('heroScore').textContent = overall;
  $('summaryText').textContent = report.summary || '';
  renderRadar(dims);

  $('dimensionAnalysis').innerHTML = dims.map((d, i) => {
    const score = Number(d.score) || 0;
    const color = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
    return `
      <div class="score-bar-container">
        <div class="score-bar-header">
          <span class="detail-label">${d.name}</span>
          <span style="color:${color};font-weight:600;">${score} 分</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">${d.comment || ''}</div>
        <div class="score-bar"><div class="score-bar-fill" style="width:${score}%;background:${color};"></div></div>
      </div>
    `;
  }).join('');

  $('strengthsList').innerHTML = (report.strengths || []).map(s => `
    <li class="list-item"><span class="list-icon strength">💪</span><span>${s}</span></li>
  `).join('');

  $('weaknessesList').innerHTML = (report.weaknesses || []).map(w => `
    <li class="list-item"><span class="list-icon weakness">⚠️</span><span>${w}</span></li>
  `).join('');

  $('suggestionsList').innerHTML = (report.suggestions || []).map(s => `
    <li class="list-item"><span class="list-icon suggestion">💡</span><span>${s}</span></li>
  `).join('');

  const pq = report.per_question || [];
  $('perQuestionList').innerHTML = pq.map(item => {
    const q = state.questions.find(qq => qq.id === item.id) || {};
    return `
      <div class="per-question-item">
        <div class="per-question-q">第 ${item.id} 题：${q.text || ''}</div>
        <div class="per-question-c">${item.comment || ''}</div>
      </div>
    `;
  }).join('');
}

async function loadHistory() {
  try {
    const data = await api('/api/interview/history');
    const list = data.history || [];
    $('historyList').innerHTML = list.length === 0
      ? '<div style="color:var(--text-muted);font-size:14px;">暂无历史面试记录</div>'
      : list.map(h => `
        <div class="history-item">
          <div class="h-info">
            <div class="h-role">${h.role || '未知岗位'}</div>
            <div class="h-meta">${h.company || ''} · ${h.created_at}</div>
          </div>
          <div class="history-score">${h.overall_score || 0}</div>
        </div>
      `).join('');
  } catch (e) {}
}

function restart() {
  stopMediaStreams();
  state.questions = [];
  state.answers = [];
  state.currentQuestion = 0;
  showPage('prep');
}

function stopMediaStreams() {
  if (state.cameraStream) state.cameraStream.getTracks().forEach(t => t.stop());
  if (state.audioStream) state.audioStream.getTracks().forEach(t => t.stop());
  state.cameraStream = null;
  state.audioStream = null;
  state.cameraReady = false;
  state.micReady = false;
  setDeviceStatus('camera', false);
  setDeviceStatus('mic', false);
  updateReadyState();
}

// ============ 初始化 ============
async function init() {
  $('resumeTextInput').addEventListener('input', onResumeTextInput);
  $('companyInput').addEventListener('input', onCompanyInput);
  $('roleInput').addEventListener('input', onRoleInput);
  $('jdInput').addEventListener('input', onJdInput);

  await checkAuth();
  updateReadyState();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('当前环境不支持摄像头/麦克风，请使用 HTTPS 或 localhost', 'error');
  }
}

window.addEventListener('DOMContentLoaded', init);
