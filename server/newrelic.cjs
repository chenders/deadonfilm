'use strict'

/**
 * New Relic agent configuration.
 * @see https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration/
 * @type {import('newrelic').Config}
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'Dead on Film'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,

  // Disable agent if license key is not set
  agent_enabled: !!process.env.NEW_RELIC_LICENSE_KEY,

  // Distributed tracing for cross-service correlation
  distributed_tracing: {
    enabled: true
  },

  // Application Logging (Logs in Context)
  // Forwards application logs to New Relic with trace correlation
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
      max_samples_stored: 10000
    },
    metrics: {
      enabled: true
    },
    local_decorating: {
      enabled: true
    }
  },

  // Agent logging (New Relic's own logs)
  // Use NEW_RELIC_LOG_LEVEL env var to override (default: warn for scripts, info for server)
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'warn',
    filepath: 'stdout'
  },

  // Transaction tracer - captures slow transactions
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f', // 4x apdex threshold
    record_sql: 'obfuscated', // Log SQL queries (obfuscated for security)
    explain_threshold: 500 // Explain plans for queries > 500ms
  },

  // Slow SQL - detailed slow query analysis
  slow_sql: {
    enabled: true,
    max_samples: 10
  },

  // Error collector - capture and report errors
  error_collector: {
    enabled: true,
    ignore_status_codes: [404], // Don't report 404s as errors
    capture_events: true,
    max_event_samples_stored: 100
  },

  // Custom instrumentation for external calls
  // Automatically instrument HTTP calls, database queries, etc.
  instrumentation: {
    pg: { enabled: true },
    timers: { enabled: true }
  },

  // Database instance reporting - required for "instrumented database" status
  // Extracts database name, host, and port from connection strings
  datastore_tracer: {
    instance_reporting: {
      enabled: true
    },
    database_name_reporting: {
      enabled: true
    }
  },

  // Span events for distributed tracing details
  span_events: {
    enabled: true,
    max_samples_stored: 2000
  },

  // Transaction events for analytics
  transaction_events: {
    enabled: true,
    max_samples_stored: 10000
  },

  // Custom events (for recordCustomEvent calls)
  custom_insights_events: {
    enabled: true,
    max_samples_stored: 30000
  },

  // Browser monitoring (injects browser agent script)
  browser_monitoring: {
    enabled: true
  },

  // Allow all headers except sensitive ones
  allow_all_headers: true,
  attributes: {
    enabled: true,
    include: [
      'request.parameters.*',
      'request.uri',
      'response.status'
    ],
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x-api-key',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*'
    ]
  },

  // Code-level metrics (shows function-level performance)
  code_level_metrics: {
    enabled: true
  },

  // AI Monitoring (for Anthropic API calls)
  ai_monitoring: {
    enabled: true,
    streaming: {
      enabled: true
    }
  }
}
