FROM nginx:stable-alpine

# Install openssl for cert generation
RUN apk add --no-cache openssl

# Add entrypoint that will create a self-signed cert if none provided
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 443

ENTRYPOINT ["/docker-entrypoint.sh"]
