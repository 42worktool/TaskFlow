FROM nginx:stable-alpine

# 외부 인증서가 없는 환경에서 self-signed fallback을 만들기 위해 설치한다.
RUN apk add --no-cache openssl

# 인증서 존재 여부를 확인한 뒤 nginx를 실행하는 진입 스크립트를 사용한다.
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 443

ENTRYPOINT ["/docker-entrypoint.sh"]
