/**
 * 途正英语AI分级测评 - 应用入口
 * 纯前端项目，不依赖Manus后端
 */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
