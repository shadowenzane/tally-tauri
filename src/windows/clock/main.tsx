// 数字钟窗口入口：透明 body + 渲染 ClockView

import { createRoot } from 'react-dom/client';
import ClockView from './ClockView';

// 无边框透明窗口：文档级透明、禁滚动条与外边距
document.body.style.background = 'transparent';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';

createRoot(document.getElementById('root') as HTMLElement).render(<ClockView />);
