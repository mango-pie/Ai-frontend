# 网页灵动设计与主题系统设计方案

## 全站背景图轮换

- 图片目录：[`src/assets/backgrounds/`](../src/assets/backgrounds/)
- 配置项：[`src/config/site.ts`](../src/config/site.ts) → `backgroundSlideshow`
- 布局接入：[`src/layouts/BasicLayout.vue`](../src/layouts/BasicLayout.vue)

---

## 一、设计目标与原则

### 1.1 设计目标
- **提升用户体验**：通过流畅的动画和交互反馈，让用户感受到界面的生命力
- **个性化主题**：支持多种主题切换，满足不同用户的审美需求
- **视觉层次分明**：通过动效引导用户注意力，突出重点内容

### 1.2 设计原则
- **性能优先**：动画不应影响页面性能，避免卡顿
- **适度原则**：动画不宜过多，避免干扰用户操作
- **一致性**：相同类型的交互应有一致的动效表现
- **可访问性**：动画应可关闭，尊重用户偏好

---

## 二、灵动设计方案

### 2.1 页面过渡动画

#### 2.1.1 路由切换动画
- **方案**：页面进入/退出时添加淡入淡出 + 滑动效果
- **实现方式**：使用 Vue Router 的过渡组件
- **动画时长**：300ms

```typescript
// src/App.vue
<router-view v-slot="{ Component }">
  <transition name="page" mode="out-in">
    <component :is="Component" />
  </transition>
</router-view>
```

```css
/* src/style/page-transition.css */
.page-enter-active,
.page-leave-active {
  transition: all 0.3s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
```

#### 2.1.2 组件过渡动画
- **方案**：列表项、模态框等组件添加渐入效果
- **实现方式**：使用 Vue 的 Transition 组件

### 2.2 微交互动画

#### 2.2.1 按钮交互
- **悬停效果**：缩放 + 阴影变化
- **点击效果**：按下时缩小，释放时回弹
- **禁用状态**：降低透明度

```css
.btn {
  transition: all 0.2s ease;
}

.btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

#### 2.2.2 卡片悬浮效果
- **方案**：鼠标悬停时卡片浮起，添加阴影
- **实现方式**：CSS transition

```css
.card {
  transition: all 0.3s ease;
}

.card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
}
```

#### 2.2.3 输入框焦点效果
- **方案**：聚焦时边框发光，标签上浮
- **实现方式**：CSS + Vue 状态绑定

```css
.input-wrapper {
  position: relative;
}

.input-wrapper input:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.1);
}

.input-wrapper label {
  transition: all 0.2s ease;
}

.input-wrapper input:focus + label {
  transform: translateY(-10px) scale(0.85);
  color: #1677ff;
}
```

### 2.3 滚动动效

#### 2.3.1 视差滚动
- **方案**：背景与内容以不同速度滚动
- **适用场景**：首页 Hero 区域

```css
.parallax {
  background-attachment: fixed;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
```

#### 2.3.2 滚动触发动画
- **方案**：元素进入视口时触发渐入动画
- **实现方式**：使用 Intersection Observer API

```typescript
// src/directives/intersection.ts
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
      }
    });
  },
  { threshold: 0.1 }
);
```

#### 2.3.3 平滑滚动
- **方案**：页面内锚点跳转平滑滚动
- **实现方式**：CSS scroll-behavior

```css
html {
  scroll-behavior: smooth;
}
```

### 2.4 加载状态动画

#### 2.4.1 骨架屏
- **方案**：内容加载前显示占位骨架
- **适用场景**：列表页、详情页

```css
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: skeleton 1.5s infinite;
}

@keyframes skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

#### 2.4.2 加载指示器
- **方案**：旋转动画或脉冲效果
- **实现方式**：CSS animation

---

## 三、主题系统设计

### 3.1 主题架构

```
src/
├── themes/
│   ├── index.ts          # 主题配置入口
│   ├── dark.ts           # 深色主题
│   ├── light.ts          # 浅色主题
│   ├── system.ts         # 跟随系统
│   └── types.ts          # 主题类型定义
├── composables/
│   └── useTheme.ts       # 主题切换 Hook
└── styles/
    └── theme.css         # 主题变量定义
```

### 3.2 主题配置

#### 3.2.1 主题类型定义

```typescript
// src/themes/types.ts
export interface ThemeConfig {
  name: string;
  id: 'light' | 'dark' | 'system';
  colors: {
    primary: string;
    primaryHover: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    
    background: string;
    backgroundSecondary: string;
    backgroundCard: string;
    
    text: string;
    textSecondary: string;
    textPlaceholder: string;
    
    border: string;
    borderLight: string;
    
    shadow: string;
    shadowHover: string;
  };
  fonts: {
    family: string;
    size: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      '2xl': string;
      '3xl': string;
    };
  };
}
```

#### 3.2.2 浅色主题配置

```typescript
// src/themes/light.ts
import type { ThemeConfig } from './types';

export const lightTheme: ThemeConfig = {
  name: '浅色主题',
  id: 'light',
  colors: {
    primary: '#1677ff',
    primaryHover: '#4080ff',
    success: '#52c41a',
    warning: '#faad14',
    error: '#f5222d',
    info: '#1890ff',
    
    background: '#ffffff',
    backgroundSecondary: '#f7f8fa',
    backgroundCard: '#ffffff',
    
    text: '#1a1a1a',
    textSecondary: '#666666',
    textPlaceholder: '#999999',
    
    border: '#e8e8e8',
    borderLight: '#f0f0f0',
    
    shadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    shadowHover: '0 8px 24px rgba(0, 0, 0, 0.1)',
  },
  fonts: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: {
      xs: '12px',
      sm: '13px',
      base: '14px',
      lg: '15px',
      xl: '16px',
      '2xl': '18px',
      '3xl': '24px',
    },
  },
};
```

#### 3.2.3 深色主题配置

```typescript
// src/themes/dark.ts
import type { ThemeConfig } from './types';

export const darkTheme: ThemeConfig = {
  name: '深色主题',
  id: 'dark',
  colors: {
    primary: '#4080ff',
    primaryHover: '#69a0ff',
    success: '#73d13d',
    warning: '#ffc53d',
    error: '#ff4d4f',
    info: '#40a9ff',
    
    background: '#1a1a1a',
    backgroundSecondary: '#242424',
    backgroundCard: '#2d2d2d',
    
    text: '#ffffff',
    textSecondary: '#a0a0a0',
    textPlaceholder: '#666666',
    
    border: '#3d3d3d',
    borderLight: '#303030',
    
    shadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    shadowHover: '0 8px 24px rgba(0, 0, 0, 0.4)',
  },
  fonts: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: {
      xs: '12px',
      sm: '13px',
      base: '14px',
      lg: '15px',
      xl: '16px',
      '2xl': '18px',
      '3xl': '24px',
    },
  },
};
```

### 3.3 主题切换实现

#### 3.3.1 主题管理 Hook

```typescript
// src/composables/useTheme.ts
import { ref, watch, onMounted } from 'vue';
import { lightTheme, darkTheme } from '@/themes';
import type { ThemeConfig } from '@/themes/types';

const currentTheme = ref<ThemeConfig>(lightTheme);
const themeId = ref<'light' | 'dark' | 'system'>('light');

export function useTheme() {
  const applyTheme = (theme: ThemeConfig) => {
    currentTheme.value = theme;
    
    // 将主题变量注入到 CSS
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
    
    Object.entries(theme.fonts.size).forEach(([key, value]) => {
      root.style.setProperty(`--font-size-${key}`, value);
    });
    
    root.style.setProperty('--font-family', theme.fonts.family);
    
    // 设置 data-theme 属性
    root.setAttribute('data-theme', theme.id);
  };

  const setTheme = (id: 'light' | 'dark' | 'system') => {
    themeId.value = id;
    
    let targetTheme = lightTheme;
    if (id === 'dark') {
      targetTheme = darkTheme;
    } else if (id === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      targetTheme = prefersDark ? darkTheme : lightTheme;
    }
    
    applyTheme(targetTheme);
    
    // 保存到 localStorage
    localStorage.setItem('theme', id);
  };

  const toggleTheme = () => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(themeId.value);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  onMounted(() => {
    // 从 localStorage 读取主题设置
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    if (saved) {
      setTheme(saved);
    }
    
    // 监听系统主题变化（仅当设置为 system 时）
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (themeId.value === 'system') {
        applyTheme(e.matches ? darkTheme : lightTheme);
      }
    });
  });

  return {
    currentTheme,
    themeId,
    setTheme,
    toggleTheme,
  };
}
```

#### 3.3.2 主题切换组件

```vue
<!-- src/components/ThemeSwitch.vue -->
<script setup lang="ts">
import { SunOutlined, MoonOutlined, MonitorOutlined } from '@ant-design/icons-vue';
import { useTheme } from '@/composables/useTheme';

const { themeId, setTheme } = useTheme();

const themeOptions = [
  { id: 'light', label: '浅色', icon: SunOutlined },
  { id: 'dark', label: '深色', icon: MoonOutlined },
  { id: 'system', label: '跟随系统', icon: MonitorOutlined },
];
</script>

<template>
  <a-dropdown>
    <a-space class="theme-switch-trigger">
      <component 
        :is="themeId === 'dark' ? MoonOutlined : SunOutlined" 
        :size="18"
      />
      <span>{{ themeOptions.find(t => t.id === themeId)?.label }}</span>
    </a-space>
    <template #overlay>
      <a-menu>
        <a-menu-item
          v-for="option in themeOptions"
          :key="option.id"
          :class="{ 'is-active': themeId === option.id }"
          @click="setTheme(option.id as any)"
        >
          <component :is="option.icon" />
          {{ option.label }}
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<style scoped>
.theme-switch-trigger {
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.theme-switch-trigger:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

:deep(.is-active) {
  color: #1677ff;
}
</style>
```

### 3.4 全局样式变量

```css
/* src/styles/theme.css */
:root {
  /* 颜色变量 */
  --color-primary: #1677ff;
  --color-primary-hover: #4080ff;
  --color-success: #52c41a;
  --color-warning: #faad14;
  --color-error: #f5222d;
  --color-info: #1890ff;
  
  --color-background: #ffffff;
  --color-background-secondary: #f7f8fa;
  --color-background-card: #ffffff;
  
  --color-text: #1a1a1a;
  --color-text-secondary: #666666;
  --color-text-placeholder: #999999;
  
  --color-border: #e8e8e8;
  --color-border-light: #f0f0f0;
  
  --color-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  --color-shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.1);
  
  /* 字体变量 */
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-lg: 15px;
  --font-size-xl: 16px;
  --font-size-2xl: 18px;
  --font-size-3xl: 24px;
  
  /* 动画变量 */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.25s ease;
  --transition-slow: 0.35s ease;
}

/* 深色主题全局样式 */
[data-theme="dark"] {
  color-scheme: dark;
}
```

---

## 四、实施计划

### 4.1 阶段一：主题系统基础（1-2 天）
1. 创建主题类型定义和配置文件
2. 实现主题管理 Hook
3. 创建主题切换组件
4. 更新全局样式文件

### 4.2 阶段二：页面过渡动画（1-2 天）
1. 实现路由切换动画
2. 添加页面骨架屏
3. 实现平滑滚动

### 4.3 阶段三：组件动效优化（2-3 天）
1. 按钮、卡片悬停效果
2. 输入框焦点动效
3. 列表项入场动画

### 4.4 阶段四：性能优化（1 天）
1. 使用 will-change 优化动画性能
2. 添加 prefers-reduced-motion 支持
3. 优化动画触发时机

---

## 五、注意事项

### 5.1 性能优化
- 使用 `will-change` 属性提示浏览器优化
- 避免在动画中使用 `width`、`height`、`top`、`left` 等触发重排的属性
- 优先使用 `transform` 和 `opacity`

### 5.2 可访问性
- 支持 `prefers-reduced-motion` 媒体查询
- 提供开关控制动画开关
- 确保动画不影响键盘导航

### 5.3 兼容性
- 深色模式在旧浏览器中优雅降级
- 动画效果在不支持的浏览器中正常显示内容

---

## 六、参考资源

- [Vue.js Transition 文档](https://vuejs.org/guide/built-ins/transition.html)
- [CSS Transitions Guide](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Transitions/Using_CSS_transitions)
- [Web Animation API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)