<template>
  <div class="legal-page-shell">
    <header class="legal-page-header">
      <RouterLink to="/signin" class="legal-page-logo">TaskFlow</RouterLink>
    </header>
    <main class="legal-document">
      <h1>개인정보처리방침</h1>
      <p class="effective-date">시행일: 2026년 7월 22일</p>

      <p>
        TaskFlow는 학습 및 시연을 위한 프로젝트입니다. 서비스는 Google 로그인을 제공하기 위해
        필요한 최소한의 개인정보만 처리합니다.
      </p>

      <h2>1. 수집하는 정보</h2>
      <ul>
        <li>Google 계정 식별자(sub), 이메일 주소, 표시 이름, 프로필 이미지 URL</li>
        <li>로그인 세션 식별자와 인증 토큰의 해시값</li>
      </ul>

      <h2>2. 이용 목적</h2>
      <p>사용자 인증, 계정 생성·관리, 로그인 상태 유지와 보안 사고 방지를 위해 이용합니다.</p>

      <h2>3. 보관 및 삭제</h2>
      <p>
        계정 정보는 사용자가 계정을 삭제할 때까지 보관합니다. Refresh 세션은 최대 7일 동안
        Redis에 보관되며 로그아웃 또는 계정 삭제 시 무효화됩니다.
      </p>

      <h2>4. 제3자 서비스</h2>
      <p>
        로그인 과정에서 Google OAuth/OpenID Connect를 사용합니다. TaskFlow는 Google 비밀번호를
        수집하지 않으며 Google API의 추가 데이터 접근 권한을 요청하지 않습니다.
      </p>

      <h2>5. 이용자의 권리</h2>
      <p>
        로그인 후 계정 설정에서 표시 이름을 수정하거나 계정을 삭제할 수 있습니다. 계정 삭제 시
        연결된 OAuth 계정 정보도 함께 삭제됩니다.
      </p>

      <h2>6. 변경</h2>
      <p>처리 내용이 변경되면 이 페이지의 시행일과 내용을 갱신합니다.</p>
    </main>
  </div>
</template>

<style scoped src="../styles/legal-page.css"></style>
