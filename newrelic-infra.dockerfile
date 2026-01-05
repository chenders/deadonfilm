FROM newrelic/infrastructure:latest
# Do not bake newrelic-infra.yml into the image to avoid committing or distributing
# sensitive credentials (e.g., New Relic license key). Instead, provide configuration
# via environment variables or by mounting the config file as a volume at runtime.
