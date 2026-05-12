// ─── 状态 ───
const MODES = {
  work:        { label: '专注时间',   defaultMin: 25, color: 'work' },
  shortBreak:  { label: '短休息',     defaultMin: 5,  color: 'break' },
  longBreak:   { label: '长休息',     defaultMin: 15, color: 'break' },
};

// 设置 ID 到模式名的映射，避免 magic string 散落各处
const MODE_SETTING_IDS = {
  work: 'workTime',
  shortBreak: 'shortBreakTime',
  longBreak: 'longBreakTime',
};

let state = {
  mode: 'work',
  secondsLeft: 25 * 60,
  totalSeconds: 25 * 60,
  isRunning: false,
  timerId: null,
  pomodoroCount: 0,
  currentSessionCount: 0,
};

// ─── DOM 引用 ───
const $ = (id) => document.getElementById(id);
const minutesEl = $('minutes');
const secondsEl = $('seconds');
const phaseLabel = $('phaseLabel');
const mainBtn = $('mainBtn');
const resetBtn = $('resetBtn');
const skipBtn = $('skipBtn');
const pomodoroCountEl = $('pomodoroCount');
const progressFill = document.querySelector('.progress-fill');
const timerDisplay = document.querySelector('.timer-display');
const modeBtns = document.querySelectorAll('.mode-btn');

// ─── SVG 圆 ───
const radius = 100;
const circumference = 2 * Math.PI * radius;

// ─── 全局单例 AudioContext（避免每次通知都创建新实例） ───
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// ─── 工具 ───
let lastDisplayedMinute = ''; // 缓存上一分钟的显示值，减少 DOM 写入
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return { m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') };
}

function updateDisplay() {
  const { m, s } = formatTime(state.secondsLeft);
  // 分钟没变就不重复写入 DOM（每个倒计时周期约 1475 次冗余写入）
  if (m !== lastDisplayedMinute) {
    minutesEl.textContent = m;
    lastDisplayedMinute = m;
  }
  secondsEl.textContent = s;

  const offset = state.totalSeconds > 0
    ? circumference * (1 - state.secondsLeft / state.totalSeconds)
    : 0;
  progressFill.style.strokeDashoffset = offset;
}

function updatePhaseLabel() {
  const mode = MODES[state.mode];
  phaseLabel.textContent = mode.label;
  // 使用 classList 操作，不破坏 body 上可能存在的其他 class
  document.body.classList.toggle('break-mode', mode.color === 'break');
}

function updateModeButtons() {
  modeBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === state.mode));
}

function updateStats() {
  pomodoroCountEl.textContent = `完成番茄: ${state.pomodoroCount}`;
}

// ─── 脉冲动画（倒计时最后 3 秒闪烁） ───
function setPulse(enable) {
  timerDisplay.classList.toggle('pulse', enable);
}

// ─── 按钮图标切换 ───
function setButtonRunning(running) {
  mainBtn.querySelector('.icon-play').style.display = running ? 'none' : 'inline';
  mainBtn.querySelector('.icon-pause').style.display = running ? 'inline' : 'none';
}

// ─── 从 DOM 读取设置（带各模式默认值回退） ───
function getSettingMinutes(id) {
  const mode = Object.keys(MODE_SETTING_IDS).find((k) => MODE_SETTING_IDS[k] === id);
  const fallback = mode ? MODES[mode].defaultMin : 25;
  const val = parseInt($(id).value, 10);
  return Math.max(1, isNaN(val) ? fallback : val);
}

function loadTimesFromSettings() {
  const mode = state.mode;
  const totalMin = getSettingMinutes(MODE_SETTING_IDS[mode]);
  state.totalSeconds = totalMin * 60;
  if (!state.isRunning) {
    state.secondsLeft = state.totalSeconds;
    resetProgress();
  }
  updateDisplay();
}

function resetProgress() {
  progressFill.style.strokeDashoffset = 0;
}

// ─── 通知 ───
function notify(title, body) {
  if (window.electronAPI) {
    window.electronAPI.showNotification({ title, body });
  }
  try {
    const ctx = getAudioContext();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.2);
    });
  } catch (_) { /* 音频不可用时静默忽略 */ }
}

// ─── 核心逻辑 ───
function switchMode(mode) {
  if (state.isRunning) {
    pauseTimer();
  }
  state.mode = mode;
  updateModeButtons();
  loadTimesFromSettings();
  updatePhaseLabel();
  setPulse(false);
}

function startTimer() {
  if (state.timerId) return;
  if (state.secondsLeft <= 0) {
    loadTimesFromSettings();
  }
  state.isRunning = true;
  setButtonRunning(true);
  setPulse(false);

  state.timerId = setInterval(() => {
    state.secondsLeft--;
    updateDisplay();

    if (state.secondsLeft <= 3 && state.secondsLeft > 0) {
      setPulse(true);
    }

    if (state.secondsLeft <= 0) {
      setPulse(false);
      finishTimer();
    }
  }, 1000);
}

function pauseTimer() {
  state.isRunning = false;
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  setButtonRunning(false);
  setPulse(false);
}

function resetTimer() {
  pauseTimer();
  loadTimesFromSettings();
  resetProgress();
  setPulse(false);
}

function skipPhase() {
  pauseTimer();
  state.secondsLeft = 0;
  updateDisplay();
  finishTimer();
}

function finishTimer() {
  pauseTimer();

  if (state.mode === 'work') {
    state.pomodoroCount++;
    state.currentSessionCount++;
    updateStats();
    notify('番茄钟', '专注时间结束！该休息一下了 🌿');

    const longInterval = parseInt($('longBreakInterval').value, 10) || 4;
    const nextMode = (state.currentSessionCount % longInterval === 0) ? 'longBreak' : 'shortBreak';
    switchMode(nextMode);
  } else {
    notify('番茄钟', '休息结束！准备开始下一个番茄 🍅');
    switchMode('work');
  }
}

// ─── 事件绑定 ───
mainBtn.addEventListener('click', () => {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

resetBtn.addEventListener('click', resetTimer);
skipBtn.addEventListener('click', skipPhase);

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// ─── 设置面板 ───
function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
}

function saveSettings() {
  if (state.isRunning) {
    pauseTimer();
  }
  loadTimesFromSettings();
  resetProgress();
  updateDisplay();
  document.getElementById('settingsPanel').classList.remove('open');
}

// ─── 初始化 ───
updateDisplay();
updatePhaseLabel();
updateStats();
progressFill.style.strokeDasharray = circumference;
progressFill.style.strokeDashoffset = 0;

// 从 localStorage 恢复
try {
  const saved = JSON.parse(localStorage.getItem('pomodoro_settings'));
  if (saved) {
    if (saved.workTime) $('workTime').value = saved.workTime;
    if (saved.shortBreakTime) $('shortBreakTime').value = saved.shortBreakTime;
    if (saved.longBreakTime) $('longBreakTime').value = saved.longBreakTime;
    if (saved.longBreakInterval) $('longBreakInterval').value = saved.longBreakInterval;
    if (saved.pomodoroCount !== undefined) state.pomodoroCount = saved.pomodoroCount;
    updateStats();
    loadTimesFromSettings();
  }
} catch (_) { /* localStorage 不可用时静默忽略 */ }

// 保存到 localStorage 监听
window.addEventListener('beforeunload', () => {
  // 关闭窗口前清除计时器，避免进程悬挂
  if (state.timerId) {
    clearInterval(state.timerId);
  }
  localStorage.setItem('pomodoro_settings', JSON.stringify({
    workTime: $('workTime').value,
    shortBreakTime: $('shortBreakTime').value,
    longBreakTime: $('longBreakTime').value,
    longBreakInterval: $('longBreakInterval').value,
    pomodoroCount: state.pomodoroCount,
  }));
});
