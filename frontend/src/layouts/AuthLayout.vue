<template>
  <div class="auth-bg">
    <div class="circle circle-1" />
    <div class="circle circle-2" />
    <main class="auth-card">
      <slot />
    </main>
    <footer class="auth-footer">© 2025 TaskFlow · 이용약관 · 개인정보처리방침</footer>
  </div>
</template>

<style scoped>
.auth-bg {
  min-height: 100vh;
  background: #0b2249;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(30, 80, 150, 0.35);
  pointer-events: none;
}

.circle-1 {
  width: 420px;
  height: 420px;
  left: -120px;
  top: 80px;
}

.circle-2 {
  width: 320px;
  height: 320px;
  right: -60px;
  bottom: 60px;
}

.auth-card {
  background: #fff;
  border-radius: 16px;
  padding: 40px 44px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  z-index: 1;
}

.auth-footer {
  position: absolute;
  bottom: 24px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  z-index: 1;
}
</style>
