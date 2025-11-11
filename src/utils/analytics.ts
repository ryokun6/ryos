// 安全的 Analytics wrapper，防止被内容拦截器阻止时影响应用

let analyticsTrack: ((event: string, data?: Record<string, unknown>) => void) | null = null;
let analyticsInitialized = false;

// 尝试初始化 Analytics
async function initAnalytics() {
  if (analyticsInitialized) return;
  analyticsInitialized = true;

  try {
    const analytics = await import("@vercel/analytics");
    analyticsTrack = analytics.track;
  } catch (error) {
    // 静默失败，不影响应用运行
    console.warn("Analytics 初始化失败（可能被内容拦截器阻止）");
    analyticsTrack = null;
  }
}

// 导出安全的 track 函数
export function track(event: string, data?: Record<string, unknown>) {
  // 如果还没有初始化，尝试初始化
  if (!analyticsInitialized) {
    initAnalytics().then(() => {
      if (analyticsTrack) {
        analyticsTrack(event, data);
      }
    });
    return;
  }

  // 如果已初始化且有 track 函数，使用它
  if (analyticsTrack) {
    try {
      analyticsTrack(event, data);
    } catch (error) {
      // 静默处理错误
      console.warn("Analytics track 失败:", error);
    }
  }
}

// 预初始化（可选，在应用启动时调用）
export function preloadAnalytics() {
  if (!analyticsInitialized) {
    initAnalytics();
  }
}

