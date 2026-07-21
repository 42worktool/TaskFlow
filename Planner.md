협업 기획서
협업툴 기획서


Fornt : Vue.js                /        Back End : node.js(typescript)        /        DB : 영구저장용(PostgreDB) / 임시 및 동시용 (redis)        /         nginx


팀구성
* PO : 남영훈(ynam)
* PM : 김창완(chakim)
* Tech-lead : 김연준(yeonjuki)
* Dev : 조인철(injo), 최우녕(wchoe)




페이지 구성 - 아래 스크린샷 참고
* base는 트렌로의 칸반 보드를 클론


* 로그인 페이지 Oauth 네이버 / 카카오


* 메인 화면에서 오픈 프로젝트 열람 가능 / 비공개 프로젝트중 소속된 프로젝트 사용가능


* 인박스랑 보드 위치 변경(보드가 왼쪽 / 인박스가 오른쪽)


* 보드 안에 기능은 보드 / 달력 / 대시보드 / 타임라인 만 구현 \\ 자료실 필요시 기능 추가


* 보드 우측상단 기능은 마이프로필 팀원관리 공유 기능만 구현


* 공유기능은 메일링크 초대로 한정 (mail.to 이용)
   * chakim: 메일링 장점이 mail.to로 연결만 하면 끝이라 메일 괜찮아 보입니다.
   * yeonjuki: 마이너 선택 모듈로 메일이 괜찮아 보여요
   * injo: 저도 메일이 괜찮을 것 같아요


  





기능
	모듈
	구분 (점수)
	시스템 뼈대 (기본 전제)
	프론트엔드 및 백엔드 프레임워크 동시 사용
	메이저
	2
	시스템 뼈대 (기본 전제)
	5개 이상의 엔드포인트를 가진 보안 API 구축
	메이저
	2
	트렐로 보드 / 채팅 (실시간)
	웹소켓(WebSocket) 기반 실시간 기능
	메이저
	2
	채팅 / 프로필 / 초대
	사용자 간 상호작용 시스템 (웹 카테고리)
	메이저
	2
	프로필 기능
	프로필 업데이트가 포함된 표준 사용자 관리
	메이저
	2
	역할별 프로젝트 관리
	관리자/일반 사용자 등 고급 권한 시스템
	메이저
	2
	달력 / 타임라인 / 대시보드
	차트가 포함된 실시간 고급 데이터 시각화 대시보드
	메이저
	2
	OAuth
	OAuth 2.0 (Google, GitHub 등) 간편 로그인
	마이너
	1
	합계        |   
	15
	추가 작업사항
	기능
	모듈
	구분 (점수)
	팀 단위의 작업 공간 분리
	조직(Organization) 관리 시스템
* 프로젝트 진행중 같이 구현하면 될 것 같습니다.
	메이저
	2
	

	

	

	

	추가의견
	* chakim: 그룹 내 사용자들끼리 채팅, 그룹 - 친구 추가 시스템, 프로필 이렇게 추가 어떠신가요
* 저희 보너스 +2점 넉넉하게 초과해서 채우는게 어떨까요? 해보니 기능하나 추가하는게 쉽지않은데 서브 2개 or 메이저 하나 추가정도는 안전빵으로 해보는게 좋을 듯 합니다
* 추가로 AI는 옵시디언처럼 컨텐츠 그룹화가 그나마 아이디어가 떠오르네요


* ynam - 채팅 / 프로필 / 초대에 포함하면 될 것 같아요


* ynam - 클론하는 거라 보너스를 안노렸는데 보너스 점수 달성이 되네요?
* injo - 추가 작업 사항이 밑에 적혀 있는 pdf를 번역한게 아닌 기본 
        기능에 추가할 거라는 뜻인가요?
        그리고 저희 보너스 점수 다 채우는 지 궁금합니다.
         트렌로 인박스에 필터 기능이 있던데 이것도 구현하면 1점 추가이긴 합니다.
* injo - 현재 트렌로 반응형 확인해봤는데 밑의 메뉴는 제대로 반응형처럼 변경되는데 
        위의 보드 부분들이 변경이 안되서 이건 저희가 디자인해야 할 것 같아요.
	



구분
	분류
	구현 내용
	Web 
	Major, 2점 
	• 프론트엔드 및 백엔드 프레임워크 동시 사용
• 웹소켓(WebSocket) 등 기반의 실시간 기능
• 사용자 간 상호작용 (채팅, 프로필, 친구 시스템)
• 5개 이상의 엔드포인트를 가진 보안 API 구축
	Minor, 1점 
	• 프론트엔드 프레임워크 단독 사용
• 백엔드 프레임워크 단독 사용
• 데이터베이스 ORM 사용
• 전체 알림 시스템
• 실시간 협업 기능
• 서버 사이드 렌더링 (SSR)
• 프로그레시브 웹 앱 (PWA)
• 커스텀 디자인 시스템 (최소 10개 컴포넌트)
• 필터 및 정렬이 포함된 고급 검색
• 파일 업로드 및 관리 시스템
	Accessibility & Internationalization 
	Major, 2점 
	• 스크린 리더 등 완벽한 웹 접근성 준수 (WCAG 2.1 AA) 
	Minor, 1점 
	• 다국어 지원 (최소 3개 언어)
• RTL (우측에서 좌측으로 읽는 언어) 지원
• 다중 브라우저(최소 2개 추가) 완벽 지원
	User Management 
	Major, 2점 
	• 프로필 업데이트 기능이 포함된 표준 사용자 관리
• 고급 권한 시스템 (역할 기반 관리, CRUD)
• 조직(Organization) 관리 시스템
	Minor, 1점 
	• 게임 통계 및 매치 기록
• OAuth 2.0을 통한 간편 로그인
• 2단계 인증 (2FA) 시스템
• 사용자 활동 분석 대시보드
	Artificial Intelligence 
	Major, 2점 
	• 사람처럼 동작하는 게임용 AI 상대
• RAG (검색 증강 생성) 시스템 구축
• 완전한 LLM 시스템 인터페이스
• 머신러닝 기반 개인화 추천 시스템
	Minor, 1점 
	• 콘텐츠 자동 모더레이션 시스템
• 음성/스피치 인식 통합
• 사용자 생성 콘텐츠 감정 분석
• 이미지 인식 및 자동 태깅 시스템
	Cybersecurity 
	Major, 2점 
	• WAF/ModSecurity 및 HashiCorp Vault를 이용한 암호화 
	Minor, 1점 
	-
	Gaming & UX 
	Major, 2점 
	• 웹 기반 대전 게임 구현
• 원격 플레이 지원 (네트워크 지연 처리)
• 3인 이상 동시 접속 멀티플레이어 게임
• 매치메이킹이 포함된 두 번째 게임 추가
• Three.js 등을 이용한 고급 3D 그래픽 환경
	Minor, 1점 
	• 고급 채팅 기능 (사용자 차단, 게임 초대 등)
• 토너먼트 시스템
• 맵/스킬 등 게임 커스터마이징 옵션
• 업적, 레벨 등이 포함된 게임화(Gamification)
• 실시간 관전자 모드
	DevOps 
	Major, 2점 
	• ELK 스택을 활용한 로그 관리 시스템
• Prometheus 및 Grafana 기반 서버 모니터링
• 백엔드 마이크로서비스 아키텍처 도입
	Minor, 1점 
	• 헬스 체크, 자동 백업 및 상태 페이지 시스템 
	Data & Analytics 
	Major, 2점 
	• 차트가 포함된 실시간 고급 데이터 시각화 대시보드 
	Minor, 1점 
	• JSON, CSV 등 포맷 기반 데이터 내보내기/가져오기
• GDPR 규정에 맞춘 사용자 데이터 관리 기능
	Blockchain 
	Major, 2점 
	• Avalanche와 Solidity를 이용해 토너먼트 점수 기록 
	Minor, 1점 
	• ICP (Internet Computer Protocol) 기반 백엔드 운영 
	Modules of choice 
	Major, 2점 
	• 기술적 난이도를 갖춘 완전히 새로운 자유 선택 모듈 
	Minor, 1점 
	새로운 자유 선택 모듈• 상대적으로 작은 규모의 자유 선택 모듈 
	

데이터베이스 다이어그램
https://dbdiagram.io/d/ft_transcendence-6a3398855c789b8acbad6f44


figma 초기 디자인
https://www.figma.com/design/M1kVwVRwvzgMdUrClh4zXI/%EC%B9%B8%EB%B0%98-%EB%B3%B4%EB%93%9C-%EC%9B%B9%EC%95%B1-UI-%EB%94%94%EC%9E%90%EC%9D%B8?node-id=0-1&t=3HdaQBDZJDXCt4rg-1








































































서비스 범위
   * 인증 및 계정 관리
   * 워크스페이스 관리
   * 보드 관리
   * 리스트 관리
   * 카드 관리
   * 멤버 초대 및 권한 관리


사용자 권한
역할
	명칭
	권한 요약
	OWNER
	워크스페이스 소유자
	어드민 권한 부여, 워크스페이스 삭제
	ADMIN
	보드 관리자
	보드 생성/삭제, 멤버 초대/제거
	MEMBER
	일반 멤버
	카드/리스트 CRUD, 파일 첨부
	VIEWER
	읽기 전용
	보드 조회
	



기능 목록
필수 여부가 T인 기능들은 서비스로서 동작하는데 필요하다고 생각한 기능들입니다.


인증 및 계정 관리


기능명
	상세 설명
	필수 여부
	회원가입
	이메일, 비밀번호, 이름으로 계정 생성. 이메일 중복 검사, 비밀번호 유효성 검사
	T
	로그인
	이메일, 비밀번호로 인증. JWT 혹은 세션으로 이용자 로그인 상태 저장
	T
	로그아웃
	JWT 혹은 세션 정보 삭제
	T
	비밀번호 변경
	현재 비밀번호 확인 후 새 비밀번호로 변경
	F
	프로필 수정
	닉네임, 프로필 이미지 업로드 및 변경
	F
	

 
워크스페이스


기능명
	상세 설명
	필수 여부
	워크스페이스 생성
	제목, 공개 여부를 설정하여 생성.
한 개의 보드가 자동으로 생성됨.
	T
	워크스페이스 조회
	인덱스 페이지에서 조회
	T
	워크스페이스 수정
	제목, 공개 여부 수정
	T
	워크스페이스 삭제
	워크스페이스 삭제. 
인덱스 페이지 혹은 워크스페이스 페이지에서 삭제
	T
	멤버 초대
	초대받을 이용자의 권한을 설정하고 이메일로 초대.
	T
	멤버 권한 변경
	OWNER 기능.
ADMIN, MEMBER, VIEWER 중 하나를 선택해 워크스페이스에 속한 이용자의 권한을 변경
	T
	멤버 제거
	이용자의 워크스페이스 접근 권한 삭제
	T
	



보드


기능명
	상세 설명
	필수 여부
	보드 생성
	

	T
	보드 목록 조회
	

	T
	보드 이름 변경
	

	T
	보드 삭제
	

	T
	



캘린더


기능명
	상세 설명
	필수 여부
	일정 생성
	

	T
	일정 수정
	

	T
	일정 삭제
	

	T
	월별 일정 조회
	

	T
	마감일 추가
	카드의 마감일을 설정하면 자동으로 일정 생성
	F
	



리스트


기능명
	상세 설명
	필수 여부
	리스트 생성
	

	

	리스트 이름 변경
	

	

	리스트 순서 변경
	

	

	리스트 이동
	리스트를 다른 보드로 이동
	F
	



카드


기능명
	상세 설명
	필수 여부
	카드 생성
	카드의 제목을 입력하고, 리스트에 생성
	T
	카드 상세 조회
	

	T
	카드 설명 입력
	

	T
	카드 제목 수정
	

	T
	카드 순서 변경
	리스트 내 카드의 순서 변경
	T
	카드 리스트 이동
	카드를 다른 리스트로 이동
	T
	카드 멤버 지정
	

	

	마감일 설정
	

	

	파일 첨부
	

	

	파일 삭제
	

	

	파일 수정
	

	

	카드 복사
	

	F
	인박스에 보관
	보드에 속해있는 카드를 이용자의 인박스로 이동
	T
	



검색


기능명
	상세 설명
	필수 여부
	전체 검색
	워크스페이스/보드 제목으로 검색
	T
	minor module: advanced search
	워크스페이스, 보드, 공개, 비공개 여부로 필터링하여 검색 결과 조회
최근 수정 시간, 유니코드 문자 순서로 정렬
페이지네이션 구현
	F
	



Inbox


기능명
	상세 설명
	필수 여부
	카드 생성
	인박스에서 원하는 위치에 카드 생성
	T
	카드 제목 수정
	생성된 카드의 제목 수정
	T
	카드 설명 입력
	카드의 상세 설명 입력
	T
	카드 삭제
	인박스 내 카드 삭제
	T
	인박스 내 카드를 보드로 이동
	인박스 내 카드를 드래그하여 보드로 이동
	T
	

보안


기능명
	상세 설명
	필수 여부
	sql 인젝션 방어
	쿼리에 파라미터 바인딩 or 방어해주는 ORM 사용
	T
	비밀번호 저장
	salt, hash 알고리즘 적용
	T
	XSS 방어
	https://vuejs.org/guide/best-practices/security
링크 참고하여 뷰 컴포넌트 구현
	T
	브루트포스 방어
	https://docs.nginx.com/waf/policies/brute-force-attacks/
링크 참고하여 nginx config 작성
	

	

DDOS 방어
	https://blog.nginx.org/blog/mitigating-ddos-attacks-with-nginx-and-nginx-plus
링크 참고하여 nginx config 작성
	

	



기술 스택


레이어 (Layer)
	기술 스택 (Tech Stack)
	Frontend
	Vue.js
	Backend
	Express
	WebSocket
	Socket.IO
	Database
	PostgreSQL
	Cache
	Redis
	Reverse Proxy
	Nginx
	

















API Endpoints


Method
	Endpoint
	설명
	POST
	/auth/signup
	회원가입
	POST
	/auth/login
	로그인
	POST
	/auth/logout
	로그아웃
	GET
	/workspaces
	워크스페이스 목록 조회
	POST
	/workspaces
	워크스페이스 생성
	GET
	/workspaces/{workspaceId}
	워크스페이스 상세 조회
	PUT
	/workspaces/{workspace_id}
	워크스페이스 수정
	DELETE
	/workspaces/{workspace_id}
	워크스페이스 삭제
	POST
	/workspaces/{workspace_id}/member
	워크스페이스 멤버 추가
	PUT
	/workspaces/{workspace_id}/member/{user_id}
	워크스페이스 멤버 수정
	DELETE
	/workspaces/{workspace_id}/member/{user_id}
	워크스페이스 멤버 삭제
	GET
	/workspaces/{workspace_id}/boards
	워크스페이스의 보드 목록 조회
	POST
	/workspaces/{workspace_id}/boards
	보드 생성
	GET
	/boards/{board_id}
	보드 상세 조회
	PUT
	/boards/{board_id}
	보드 수정
	DELETE
	/boards/{board_id}
	보드 삭제
	POST
	/boards/{board_id}/lists
	리스트 생성
	PUT
	/lists/{list_id}
	리스트 수정
	DELETE
	/lists/{list_id}
	리스트 삭제
	POST
	/lists/{list_id}/cards
	카드 생성
	GET
	/cards/{card_id}
	카드 상세 조회
	PUT
	/cards/{card_id}
	카드 수정
	DELETE
	/cards/{card_id}
	카드 삭제
	POST
	/cards/{card_id}/attachments
	파일 첨부
	DELETE
	/cards/attachments/{attachment_id}
	첨부된 파일 삭제
	





트렐로 기본 룰
https://trello.com/invite/b/6a333e01641c8161ed2b3588/ATTI40182f223da795eed4f91e4195edaa23BB74E216/simple-dev

트렐로 링크입니다
1. 리스트(List) 구조 및 의미
보드는 작업의 '진행 단계'를 나타내는 5개의 리스트로 구성됩니다. 작업 카드는 진행 상황에 따라 반드시 왼쪽에서 오른쪽으로 이동합니다.
   * Backlog: 프로젝트의 전체 요구사항 및 앞으로 해야 할 일들이 모여 있는 대기소입니다.
   * To-do: 이번 주(또는 현재 스프린트)에 당장 시작해야 할 작업 목록입니다.
   * WIP (Work In Progress): 현재 담당자가 실제로 작업을 진행 중인 카드입니다. (업무 과부하를 막기 위해 개인당 1~2개로 유지합니다.)
   * Review: 작업이 완료되어 PR(Pull Request)을 올렸거나, 다른 팀원의 리뷰 및 확인을 기다리는 상태입니다.
   * Done: 리뷰가 승인되고 최종적으로 마무리된 작업입니다.
2. 라벨(Label) 규칙
우리 보드에서 라벨은 '담당자'와 '특수 상태'를 구분하는 용도로만 사용합니다. 카드위에 L을 누르면 쉽게 라벨 부여 가능 합니다.
   * 담당자 라벨: 각자의 역할에 맞는 색상을 확인해 주세요.
   * 주황: Yeonjuki (TL)
   * 초록: ynam (PO)
   * 보라: injo (Dev)
   * 노랑: chakim (PM)
   * 분홍: wchoe (Dev)
   * 특수 라벨:
   * 🔴 Waiting: 다른 팀원의 선행 작업이 완료되어야 진행할 수 있는 대기 상태입니다. (이 라벨이 붙은 카드는 설명란에 어떤 작업을 기다리고 있는지 명시해 둡니다.)
   * 🔵 스트레치: 핵심 모듈 개발이 완료된 후 진행할 후순위 목표입니다.
3. 작업 진행 방법 (Workflow)
   1. 작업 시작: To-do 리스트에 있는 본인 라벨의 카드를 WIP로 직접 드래그하여 옮긴 후 작업을 시작합니다.
   2. 세부 태스크 작성: 카드를 클릭해 열고 '체크리스트(Checklist)'를 추가하여, 2~3일 단위로 끝낼 수 있는 세부 구현 목록을 작성합니다.
   3. 상태 공유: 작업 중 논의가 필요한 사항이나 공유할 링크(레포지토리, PR 링크 등)가 있다면 카드의 댓글(Activity)이나 설명(Description)에 남깁니다.
   4. 블로커 발생 시: 타 파트의 작업이 필요해 진행이 막힌 경우, 카드에 🔴 Waiting 라벨을 추가하여 팀원들이 바로 인지할 수 있게 합니다.
   5. 작업 완료: 코딩 등 실무가 끝나면 카드를 Review로 넘기고, 모든 확인 과정이 끝나면 Done으로 이동시킵니다.


API 명세


Auth
	Method
	Endpoint
	설명
	POST
	/auth/signup
	회원가입
	POST
	/auth/login
	로그인
	POST
	/auth/logout
	로그아웃 + refresh 무효화
	GET
	/auth/me
	현재 로그인 유저 조회
	PUT
	/auth/password
	비밀번호 변경
	POST
	/auth/refresh
	access token 재발급
	





OAuth
	Method
	Endpoint
	설명
	GET
	/auth/oauth/naver
	네이버 OAuth 시작
	GET
	/auth/oauth/kakao
	카카오 OAuth 시작
	GET
	/auth/oauth/callback/naver
	네이버 OAuth 콜백
	GET
	/auth/oauth/callback/kakao
	카카오 OAuth 콜백
	



Users
	Method
	Endpoint
	설명
	GET
	/users/{user_id}/profile
	공개 프로필 조회
	PUT
	/users/me/profile
	닉네임, 프로필 이미지 변경
	





Workspaces
	Method
	Endpoint
	설명
	GET
	/workspaces
	워크스페이스 목록 조회
	POST
	/workspaces
	워크스페이스 생성
	GET
	/workspaces/{workspace_id}
	워크스페이스 상세 조회
	PUT
	/workspaces/{workspace_id}
	워크스페이스 수정
	DELETE
	/workspaces/{workspace_id}
	워크스페이스 삭제
	POST
	/workspaces/{workspace_id}/members
	멤버 초대 (이메일)
	PUT
	/workspaces/{workspace_id}/members/{user_id}
	멤버 권한 변경
	DELETE
	/workspaces/{workspace_id}/members/{user_id}
	멤버 제거
	



Lists
	Method
	Endpoint
	설명
	POST
	/workspaces/{workspace_id}/lists
	리스트 생성
	PUT
	/lists/{list_id}
	리스트 수정
	DELETE
	/lists/{list_id}
	리스트 삭제
	PATCH
	/lists/{list_id}/order
	리스트 순서 변경
	PUT
	/lists/{list_id}/move
	다른 보드로 이동
	









Cards
	Method
	Endpoint
	설명
	POST
	/lists/{list_id}/cards
	카드 생성
	GET
	/cards/{card_id}
	카드 상세 조회
	PUT
	/cards/{card_id}
	카드 수정 (제목, 설명)
	DELETE
	/cards/{card_id}
	카드 삭제
	PUT
	/cards/{card_id}/order
	카드 순서 변경
	PUT
	/cards/{card_id}/move
	다른 리스트로 이동
	PUT
	/cards/{card_id}/dates
	시작일/마감일 설정[a]
	PUT
	/cards/{card_id}/inbox
	인박스로 이동
	POST
	/cards/{card_id}/members
	카드 멤버 지정
	DELETE
	/cards/{card_id}/members/{user_id}
	카드 멤버 제거
	POST
	/cards/{card_id}/attachments
	파일 첨부
	DELETE
	/cards/attachments/{attachment_id}
	파일 삭제
	





  





Comments
	Method
	Endpoint
	설명
	POST
	/cards/{card_id}/comments
	댓글 작성
	PATCH
	/comments/{comment_id}
	댓글 수정
	DELETE
	/comments/{comment_id}
	댓글 삭제
	





Labels
	Method
	Endpoint
	설명
	GET
	/workspaces/{workspace_id}/labels
	라벨 목록 조회
	POST
	/workspaces/{workspace_id}/labels
	라벨 생성
	DELETE
	/labels/{label_id} 
	라벨 삭제
	POST
	/cards/{card_id}/labels
	카드에 라벨 부착
	DELETE
	/cards/{card_id}/labels/{label_id}
	카드에서 라벨 제거
	





Inbox
	Method
	Endpoint
	설명
	GET
	/inbox
	인박스 카드 목록 조회
	POST
	/inbox/cards
	인박스에서 카드 생성
	PUT
	/inbox/cards/{card_id}
	인박스 카드 수정
	DELETE
	/inbox/cards/{card_id}
	인박스 카드 삭제
	PUT
	/inbox/cards/{card_id}/move
	보드로 이동
	





Calendar
	Method
	Endpoint
	설명
	GET
	/workspaces/{workspace_id}/calendar?month=YYYY-MM
	월별 일정 조회
	POST
	/boards/{board_id}/events
	일정 생성
	PUT
	/events/{event_id}
	일정 수정
	DELETE
	/events/{event_id}
	일정 삭제
	



Search
	Method
	Endpoint
	설명
	GET
	/search?q={keyword}
	전체 검색
	

Request / Response Body
Request / Response Body
베이스 URL: /api
인증: session httpOnly 쿠키(JWT, 7일 만료). credentials: 'same-origin'로 요청.
________________
공통 응답
공통 에러 응답
{ "error": "에러 메시지" }
   * 400: 입력값 검증 실패
   * 401: 로그인 필요 (requireAuth)
   * 403: 권한 없음 (requireProjectRole)
   * 404: 리소스 없음
   * 502/503: 외부 OAuth 연동 실패
   * 500: 서버 오류
공통 모델
User {
 id: string
 name: string
 email?: string | null
 avatarUrl?: string | null
 provider?: string
}

Member {
 id: string
 role: 'OWNER' | 'ADMIN' | 'MEMBER'
 user: User
}

Project[b][c][d][e][f][g][h] {
 id: string
 name: string
 description?: string | null
 isPublic: boolean
 members: Member[]
 lists: List[]
 myRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | null
}

List {
 id: string
 title: string
 position: number
 cards: Card[]
}

Card {
 id: string
 title: string
 description?: string | null
 position: number
 startDate?: string | null   // ISO datetime
 dueDate?: string | null     // ISO datetime
 done: boolean
 listId?: string | null
 inboxOwnerId?: string | null
}

ChatMessage {
 id: string
 body: string
 projectId: string
 userId: string
 createdAt: string
 user: { id: string, name: string, avatarUrl?: string | null }
}
________________
1. 헬스체크
GET /api/health
   * Request body: 없음
   * Response 200:
{ "ok": true }
________________
2. 인증 (/api/auth)
GET /api/auth/:provider(google)
소셜 로그인 시작 (리다이렉트). Request/Response body 없음.
GET /api/auth/:provider(google)/callback
OAuth 콜백. Query: code, state. Body 없음 (성공 시 /로 리다이렉트 + session 쿠키 설정).
POST /api/auth/dev
개발용 로그인 (프로덕션에서는 비활성, 404).
   * Request body:
{ "name": "string (선택, 기본값 '개발자')" }
   * Response 200:
{ "ok": true }
(+ session 쿠키 설정)
GET /api/auth/me
인증 필요. Request body 없음.
   * Response 200:
{
 "id": "string",
 "name": "string",
 "email": "string | null",
 "avatarUrl": "string | null",
 "provider": "string"
}
   * Response 401: 인증 안 됨 / 사용자 없음
POST /api/auth/logout
   * Request body: 없음
   * Response 200:
{ "ok": true }
________________
3. 프로젝트 (/api/projects)
GET /api/projects
인증 필요. Request body 없음.
   * Response 200:
{
 "publicProjects": [Project],
 "myProjects": [Project]
}
POST /api/projects
인증 필요.
   * Request body:
{
 "name": "string (1~100자, 필수)",
 "description": "string (최대 500자, 선택)",
 "isPublic": "boolean (선택)"
}
   * Response 201: Project (기본 리스트 "할 일"/"진행 중"/"완료" 자동 생성, 생성자는 OWNER)
   * Response 400: 입력값 오류
GET /api/projects/:projectId
인증 필요 (공개 프로젝트는 누구나, 비공개는 멤버만).
   * Request body 없음
   * Response 200: Project & { myRole }
   * Response 403/404
PATCH /api/projects/:projectId
ADMIN 이상 권한 필요.
   * Request body (모두 선택, 부분 업데이트):
{
 "name": "string (1~100자)",
 "description": "string (최대 500자)",
 "isPublic": "boolean"
}
   * Response 200: Project
DELETE /api/projects/:projectId
OWNER 권한 필요.
   * Request body 없음
   * Response 200: { "ok": true }
PATCH /api/projects/:projectId/members/:memberId
ADMIN 이상 권한 필요. (OWNER 멤버는 변경 불가)
   * Request body:
{ "role": "ADMIN" | "MEMBER" }
   * Response 200: Member
   * Response 400: 변경 불가한 멤버 / 잘못된 role
DELETE /api/projects/:projectId/members/:memberId
ADMIN 이상 권한 필요. (OWNER 멤버는 제거 불가)
   * Request body 없음
   * Response 200: { "ok": true }
POST /api/projects/:projectId/invites
ADMIN 이상 권한 필요. 초대 링크(JWT, 7일 만료) 발급.
   * Request body 없음
   * Response 200:
{ "inviteUrl": "string (URL)" }
POST /api/projects/invites/:token/accept
인증 필요. 초대 토큰을 검증해 본인을 MEMBER로 가입시킴.
   * Request body 없음
   * Response 200:
{ "projectId": "string" }
   * Response 400: 만료/잘못된 토큰
________________
4. 보드 (리스트/카드) (/api/projects/:projectId/...)
POST /api/projects/:projectId/lists
MEMBER 이상 권한 필요.
   * Request body:
{ "title": "string (필수, trim 후 비어있으면 400)" }
   * Response 201: List (cards 제외)
   * 소켓 브로드캐스트: board:changed
PATCH /api/projects/:projectId/lists/:listId
MEMBER 이상 권한 필요.
   * Request body (선택):
{
 "title": "string",
 "position": "number"
}
   * Response 200: List
   * 소켓 브로드캐스트: board:changed
DELETE /api/projects/:projectId/lists/:listId
MEMBER 이상 권한 필요.
   * Request body 없음
   * Response 200: { "ok": true }
   * 소켓 브로드캐스트: board:changed
POST /api/projects/:projectId/lists/:listId/cards
MEMBER 이상 권한 필요.
   * Request body (zod cardSchema):
{
 "title": "string (1~200자, 필수)",
 "description": "string (최대 2000자, 선택)",
 "startDate": "ISO datetime | null (선택)",
 "dueDate": "ISO datetime | null (선택)",
 "done": "boolean (선택)"
}
   * Response 201: Card
   * Response 400: 검증 실패
   * 소켓 브로드캐스트: board:changed
PATCH /api/projects/:projectId/cards/:cardId
MEMBER 이상 권한 필요.
   * Request body (cardSchema의 partial + 추가 필드, 모두 선택):
{
 "title": "string (1~200자)",
 "description": "string (최대 2000자)",
 "startDate": "ISO datetime | null",
 "dueDate": "ISO datetime | null",
 "done": "boolean",
 "listId": "string",
 "position": "number"
}
   * Response 200: Card
   * 소켓 브로드캐스트: board:changed
DELETE /api/projects/:projectId/cards/:cardId
MEMBER 이상 권한 필요.
   * Request body 없음
   * Response 200: { "ok": true }
   * 소켓 브로드캐스트: board:changed
GET /api/projects/:projectId/stats
MEMBER 이상 권한 필요.
   * Request body 없음
   * Response 200:
{
 "perList": [{ "title": "string", "count": "number" }],
 "total": "number",
 "done": "number",
 "overdue": "number"
}
GET /api/projects/:projectId/messages
MEMBER 이상 권한 필요. 최근 200개, 오래된 순.
   * Request body 없음
   * Response 200: ChatMessage[]
________________
5. 개인 인박스 (/api/inbox)
GET /api/inbox
인증 필요. 보드에 배치되지 않은 내 카드 목록.
   * Request body 없음
   * Response 200: Card[]
POST /api/inbox
인증 필요.
   * Request body:
{ "title": "string (필수, trim 후 비어있으면 400)" }
   * Response 201: Card
POST /api/inbox/:cardId/move
인증 필요. 인박스 카드를 특정 리스트(보드)로 이동.
   * Request body:
{ "listId": "string (필수)" }
   * Response 200: Card
   * Response 400: 리스트 없음
   * Response 403: 해당 프로젝트 멤버 아님
   * Response 404: 카드 없음 / 내 카드 아님
DELETE /api/inbox/:cardId
인증 필요 (본인 소유 카드만).
   * Request body 없음
   * Response 200: { "ok": true }
   * Response 404: 카드 없음 / 내 카드 아님
________________
6. 사용자 (/api/users)
PATCH /api/users/me
인증 필요.
   * Request body (모두 선택, zod 검증):
{
 "name": "string (1~50자)",
 "email": "string (email 형식) | null",
 "avatarUrl": "string (URL 형식) | null"
}
   * Response 200:
{
 "id": "string",
 "name": "string",
 "email": "string | null",
 "avatarUrl": "string | null"
}
(+ session 쿠키 재설정, name 변경 반영)








[a]트렐로에서 확인해보니 start_at과 deadline을 한 번에 설정해서 이렇게 변경했습니다.
기본적으로는 start_at이 null로 들어가고 마감일만 들어가게 되는것 같아요
옆에 이미지처럼 입력이 가능합니다!
총 반응 1개
2026-06-25 5:51 오전 UTC에 Chizu Leni님의 반응: 👍
[b]기존에는 Workspace에 여러 Board를 가질 수 있었는데, Project에 Workspace와 단 하나의 Board를 합치는 방향으로 잡힌 건가요?
[c]아니에요 그냥 막 작성한 거라 변경해야 할 것 같아요.
이 부분 수정하겠습니다!
총 반응 1개
2026-06-20 4:48 오전 UTC에 Chizu Leni님의 반응: 👍
[d]위크스페이스랑 보드랑 하나로 합치면 어떨까 합니다
큰회사에서 여러팀을 관리하려고 쓰는건데 저희 입장에선 그렇게 안커도 된다고 생각해요
총 반응 2개
2026-06-20 5:25 오전 UTC에 조인철님의 반응: 👍
2026-06-20 5:54 오전 UTC에 Chizu Leni님의 반응: 👍
[e]그러면 한 워크스페이스에 한 보드만 있는건가요?
[f]워크스페이스는 없이 하고 보드만 하나씩 남기는건 어떤가요?
[g]한 프로젝트당 하나의 보드 이런식으로요
[h]ㅇㅎ 확인했습니다!