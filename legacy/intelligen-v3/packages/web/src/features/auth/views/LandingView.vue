<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();

function goToLogin() {
  router.push('/login');
}
</script>

<template>
  <div class="landing-page">
    <!-- Navbar -->
    <nav class="glass-nav">
      <div class="logo">🧠 IntelliGen · 智研</div>
      <div class="nav-links">
        <a href="#features">核心能力</a>
        <a href="#about">关于我们</a>
      </div>
      <button class="primary-btn shimmer" @click="goToLogin">
        开始调研 &rarr;
      </button>
    </nav>

    <!-- Hero Section -->
    <header class="hero-section">
      <div class="hero-content">
        <div class="badge glow-badge">✨ AI DRIVEN RESEARCH</div>
        <h1 class="main-title">洞悉数据，赋能研究</h1>
        <p class="subtitle">
          融合前沿大语言模型与深度数据分析算法，只需一键导入，<br />
          为您在海量文献与数据中寻觅灵感，构建全能的科研工作站。
        </p>
        <div class="hero-actions">
          <button class="primary-btn large shimmer" @click="goToLogin">
            创建研究项目 &rarr;
          </button>
        </div>
      </div>
      
      <!-- Mockup Showcase -->
      <div class="mockup-container">
        <!-- Replace this with a real screenshot when you have one -->
        <div class="dashboard-mockup-placeholder">
          <div class="mockup-top-bar">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <div class="mockup-body">
            <div class="mockup-sidebar"></div>
            <div class="mockup-main">
              <div class="mockup-header"></div>
              <div class="mockup-grid">
                <div class="mockup-card" style="grid-column: span 2;"></div>
                <div class="mockup-card"></div>
                <div class="mockup-card"></div>
                <div class="mockup-card" style="grid-column: span 2; grid-row: span 2;"></div>
                <div class="mockup-card"></div>
                <div class="mockup-card"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="mockup-glow"></div>
      </div>
    </header>

    <!-- Bento Box Features -->
    <section id="features" class="bento-section">
      <h2 class="section-title">全能您的科研管家</h2>
      <div class="bento-grid">
        <!-- Feature 1: Large -->
        <div class="bento-card col-span-2 row-span-2 highlight-card">
          <div class="card-content">
            <h3>🤖 智能知识图谱引擎</h3>
            <p>自动解析数万篇PDF文献，为您构建专属的立体概念网络图谱。</p>
          </div>
          <div class="card-visual graph-visual"></div>
        </div>
        <!-- Feature 2: Medium -->
        <div class="bento-card col-span-1 row-span-1">
          <div class="card-content">
            <h3>📊 全景数据大盘</h3>
            <p>实时跟踪课题进展，自动分析核心数据。</p>
          </div>
        </div>
        <!-- Feature 3: Medium -->
        <div class="bento-card col-span-1 row-span-1">
          <div class="card-content">
            <h3>💬 深度研讨助手</h3>
            <p>基于本地知识库的私人学术对话。</p>
          </div>
        </div>
        <!-- Feature 4: Wide -->
        <div class="bento-card col-span-2 row-span-1">
          <div class="card-content">
            <h3>📄 一键研报生成</h3>
            <p>排版、校阅、输出，支持 Word/PDF 标准学术格式导出。</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* V2 Color Palette & Global Variables */
.landing-page {
  --bg-color: #0B0F19; /* Dark Night Blue */
  --surface-glass: rgba(255, 255, 255, 0.03);
  --border-light: rgba(255, 255, 255, 0.1);
  --text-main: #FFFFFF;
  --text-muted: #94A3B8;
  --accent-color: #8B5CF6; /* Electric Purple */
  --accent-blue: #3B82F6; /* Neon Blue */
  
  background-color: var(--bg-color);
  background-image: 
    radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 40%);
  color: var(--text-main);
  min-height: 100vh;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  overflow-x: hidden;
  position: relative;
}

/* Subtle Grid Background */
.landing-page::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 100%;
  background-image: 
    linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  pointer-events: none;
  z-index: 0;
  mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 90%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 90%);
}

/* Glass Navbar */
.glass-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 3rem;
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-light);
  z-index: 50;
}

.logo {
  font-weight: 800;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
}

.nav-links {
  display: flex;
  gap: 2.5rem;
}

.nav-links a {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.95rem;
  transition: color 0.2s ease;
  font-weight: 500;
}

.nav-links a:hover {
  color: var(--text-main);
}

/* Buttons & Micro-interactions */
.primary-btn {
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-color));
  color: white;
  border: none;
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.primary-btn.large {
  padding: 1rem 2.5rem;
  font-size: 1.1rem;
  border-radius: 999px;
}

/* Shimmer effect */
.shimmer::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(to bottom right, 
    rgba(255,255,255,0) 0%, 
    rgba(255,255,255,0.15) 50%, 
    rgba(255,255,255,0) 100%);
  transform: rotate(45deg);
  transition: all 0.3s ease;
  opacity: 0;
}

.shimmer:hover::after {
  animation: shimmerAnim 1.5s infinite;
  opacity: 1;
}

@keyframes shimmerAnim {
  0% { transform: translateX(-100%) rotate(45deg); }
  100% { transform: translateX(100%) rotate(45deg); }
}

.primary-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
}

/* Hero Section */
.hero-section {
  padding-top: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 10;
  text-align: center;
}

.hero-content {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 20px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #C4B5FD;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-bottom: 1.5rem;
}

.glow-badge {
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.2);
}

.main-title {
  font-size: 4.5rem;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 1.5rem;
  background: linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0.7) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.03em;
}

.subtitle {
  font-size: 1.25rem;
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: 2.5rem;
  max-width: 650px;
}

/* Mockup Showcase Placeholder structure */
.mockup-container {
  margin-top: 5rem;
  position: relative;
  width: 90%;
  max-width: 1200px;
  border-radius: 16px;
  transform: perspective(1000px) rotateX(8deg);
  transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);
}

.mockup-container:hover {
  transform: perspective(1000px) rotateX(2deg) translateY(-10px);
}

.dashboard-mockup-placeholder {
  width: 100%;
  height: 600px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mockup-top-bar {
  height: 40px;
  border-bottom: 1px solid var(--border-light);
  background: rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
}

.mockup-body {
  display: flex;
  flex: 1;
}

.mockup-sidebar {
  width: 200px;
  border-right: 1px solid var(--border-light);
  background: rgba(0,0,0,0.1);
}

.mockup-main {
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.mockup-header {
  height: 48px;
  background: rgba(255,255,255,0.05);
  border-radius: 8px;
}

.mockup-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.mockup-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  height: 120px;
}

.mockup-glow {
  position: absolute;
  top: 10%;
  left: 10%;
  right: 10%;
  bottom: -40px;
  background: var(--accent-color);
  filter: blur(100px);
  opacity: 0.2;
  z-index: -1;
}

/* Bento section */
.bento-section {
  padding: 8rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 10;
}

.section-title {
  text-align: center;
  font-size: 2.5rem;
  margin-bottom: 4rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: minmax(220px, auto);
  gap: 1.5rem;
}

.bento-card {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid var(--border-light);
  border-radius: 20px;
  padding: 2.5rem;
  transition: all 0.3s ease;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.bento-card:hover {
  border-color: rgba(139, 92, 246, 0.4);
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  transform: translateY(-2px);
}

.col-span-2 { grid-column: span 2; }
.col-span-1 { grid-column: span 1; }
.row-span-2 { grid-row: span 2; }
.row-span-1 { grid-row: span 1; }

.card-content h3 {
  font-size: 1.4rem;
  margin-bottom: 1rem;
  font-weight: 600;
  color: #F8FAFC;
}

.card-content p {
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1.6;
}

/* Decorative visual for highlight card */
.highlight-card {
  background: linear-gradient(180deg, rgba(30, 27, 75, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%);
  border-color: rgba(139, 92, 246, 0.2);
}

.graph-visual {
  flex: 1;
  margin-top: 1.5rem;
  border-radius: 12px;
  background: 
    radial-gradient(circle at 30% 50%, rgba(59, 130, 246, 0.2) 0%, transparent 40%),
    radial-gradient(circle at 70% 30%, rgba(139, 92, 246, 0.2) 0%, transparent 40%);
  border: 1px dashed rgba(255,255,255,0.1);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.graph-visual::before {
  content: 'Visualization Placeholder';
  color: rgba(255,255,255,0.2);
  font-size: 0.9rem;
  letter-spacing: 0.1em;
}

@media (max-width: 900px) {
  .bento-grid { grid-template-columns: repeat(2, 1fr); }
  .col-span-2 { grid-column: span 2; }
  .main-title { font-size: 3rem; }
}

@media (max-width: 600px) {
  .bento-grid { grid-template-columns: 1fr; }
  .col-span-2 { grid-column: span 1; }
  .nav-links { display: none; }
  .main-title { font-size: 2.5rem; }
  .dashboard-mockup-placeholder { height: 300px; }
  .mockup-sidebar { display: none; }
}
</style>
