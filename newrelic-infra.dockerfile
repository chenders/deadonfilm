FROM newrelic/infrastructure:1.71.3

# Install curl (if not already present)
RUN apk add --no-cache curl

# Install PostgreSQL integration
RUN curl -Lo /tmp/nri-postgresql.tar.gz \
    https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-postgresql_latest.tar.gz && \
    tar -xzf /tmp/nri-postgresql.tar.gz -C / && \
    rm /tmp/nri-postgresql.tar.gz

# Install Redis integration
RUN curl -Lo /tmp/nri-redis.tar.gz \
    https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-redis_latest.tar.gz && \
    tar -xzf /tmp/nri-redis.tar.gz -C / && \
    rm /tmp/nri-redis.tar.gz

# Install Nginx integration
RUN curl -Lo /tmp/nri-nginx.tar.gz \
    https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-nginx_latest.tar.gz && \
    tar -xzf /tmp/nri-nginx.tar.gz -C / && \
    rm /tmp/nri-nginx.tar.gz

# Do not bake newrelic-infra.yml or credentials into the image. Configuration
# is provided via environment variables and volume-mounted config files at runtime.
