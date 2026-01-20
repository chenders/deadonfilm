FROM newrelic/infrastructure:1.71.3

# Install PostgreSQL integration
RUN apk add --no-cache curl && \
    curl -Lo /tmp/nri-postgresql.tar.gz https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/nri-postgresql_latest.tar.gz && \
    tar -xzf /tmp/nri-postgresql.tar.gz -C / && \
    rm /tmp/nri-postgresql.tar.gz

# Do not bake newrelic-infra.yml or credentials into the image. Configuration
# is provided via environment variables and volume-mounted config files at runtime.
