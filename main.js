// ─── 导入 Electron 核心模块 ───
// app: 应用生命周期控制
// BrowserWindow: 创建和管理窗口
// Notification: 系统原生通知
// ipcMain: 主进程与渲染进程的进程间通信
const { app, BrowserWindow, Notification, ipcMain } = require('electron');
const path = require('path');

// ─── 全局窗口引用 ───
// 保存主窗口实例，防止被垃圾回收
let mainWindow;

/**
 * 创建主窗口
 * 配置窗口大小、外观、安全策略，并加载 HTML 界面
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,           // 窗口宽度
    height: 620,          // 窗口高度（增加，给设置面板留空间）
    resizable: true,      // 允许用户缩放窗口，设置面板展开时可能需要更多空间
    frame: false,         // 隐藏系统标题栏，使用自定义标题栏（renderer 中实现）
    transparent: false,   // 不启用透明背景（性能更好）
    backgroundColor: '#1a1a2e', // 背景色，防止加载时白屏闪烁
    webPreferences: {
      // 预加载脚本路径：在渲染进程创建前执行，安全地暴露 API
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,     // 禁止渲染进程直接访问 Node.js（安全）
      contextIsolation: true,     // 隔离渲染进程与 preload 的上下文（安全）
    },
  });

  // 加载渲染层的 HTML 文件
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // 不置顶，允许其他窗口覆盖
  mainWindow.setAlwaysOnTop(false);
}

// ─── 应用就绪后创建窗口 ───
// app.whenReady() 在 Electron 完成初始化后触发
app.whenReady().then(createWindow);

// ─── 窗口全部关闭时退出应用（macOS 除外） ───
// macOS 惯例：关闭所有窗口不退出应用，用户主动 Cmd+Q 才退出
// Windows/Linux 惯例：关闭最后一个窗口即退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── macOS 点击 Dock 图标时重新创建窗口 ───
// 当所有窗口已关闭但应用仍在运行时，点击 Dock 图标触发此事件
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ════════════════════════════════════════════
//  IPC（进程间通信）处理
//  渲染进程通过 preload.js 暴露的 API 发送消息
//  主进程在此接收并执行系统级操作
// ════════════════════════════════════════════

/**
 * IPC: 显示系统原生通知
 * 在番茄钟阶段切换时，向用户发送桌面通知
 * 接收数据: { title: string, body: string }
 */
ipcMain.on('show-notification', (_event, { title, body }) => {
  // 检查当前系统是否支持通知功能
  if (Notification.isSupported()) {
    // 创建并显示原生通知
    new Notification({ title, body }).show();
  }
});

/**
 * IPC: 最小化窗口
 * 用户点击标题栏的"─"按钮时触发
 */
ipcMain.on('minimize-window', () => {
  // 使用可选链操作符 ?. 防止 mainWindow 为空时出错
  mainWindow?.minimize();
});

/**
 * IPC: 关闭窗口
 * 用户点击标题栏的"✕"按钮时触发
 * 会触发 'window-all-closed' 事件，进而退出应用
 */
ipcMain.on('close-window', () => {
  mainWindow?.close();
});
