FROM newrelic/infrastructure:1.71.3

# Install curl (if not already present)
RUN apk add --no-cache curl

# Install PostgreSQL integration v2.23.0
RUN curl -Lo /tmp/nri-postgresql.tar.gz \
    https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-postgresql_linux_2.23.0_amd64.tar.gz && \
    tar -xzf /tmp/nri-postgresql.tar.gz -C / && \
    chmod +x /var/db/newrelic-infra/newrelic-integrations/bin/nri-postgresql && \
    rm /tmp/nri-postgresql.tar.gz

# Install Redis integration v1.12.7
RUN curl -Lo /tmp/nri-redis.tar.gz \
    https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-redis_linux_1.12.7_amd64.tar.gz && \
    tar -xzf /tmp/nri-redis.tar.gz -C / && \
    chmod +x /var/db/newrelic-infra/newrelic-integrations/bin/nri-redis && \
    rm /tmp/nri-redis.tar.gz

# Install Nginx integration v3.6.4
RUN curl -Lo /tmp/nri-nginx.tar.gz \
    https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-nginx_linux_3.6.4_amd64.tar.gz && \
    tar -xzf /tmp/nri-nginx.tar.gz -C / && \
    chmod +x /var/db/newrelic-infra/newrelic-integrations/bin/nri-nginx && \
    rm /tmp/nri-nginx.tar.gz

# Do not bake newrelic-infra.yml or credentials into the image. Configuration
# is provided via environment variables and volume-mounted config files at runtime.
