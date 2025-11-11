import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { useThemeStore } from "./stores/useThemeStore";

// Hydrate theme from localStorage before rendering
try {
  useThemeStore.getState().hydrate();
} catch (error) {
  console.error("主题初始化失败:", error);
}

// 动态导入 Analytics，失败时不影响主应用
const Analytics = lazy(() =>
  import("@vercel/analytics/react")
    .then((module) => ({ default: module.Analytics }))
    .catch(() => {
      // 如果 Analytics 加载失败（通常是被广告拦截器阻止），返回一个空组件
      console.warn("Analytics 被内容拦截器阻止，已跳过加载");
      return { default: () => null };
    })
);

// 检查 root 元素是否存在
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("找不到 root 元素！");
  throw new Error("找不到 root 元素");
}

console.log("开始渲染 React 应用...");

try {
  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <App />
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </React.StrictMode>
  );
  
  console.log("React 应用已成功挂载");
} catch (error) {
  console.error("React 应用挂载失败:", error);
  // 显示错误信息
  rootElement.innerHTML = `
    <div style="color: white; padding: 20px; font-family: monospace;">
      <h1>应用加载失败</h1>
      <p>错误信息: ${error instanceof Error ? error.message : String(error)}</p>
      <p>请查看浏览器控制台获取更多信息。</p>
    </div>
  `;
}
