'use strict'

/**
 * New Relic agent configuration.
 * @see https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration/
 * @type {import('newrelic').Config}
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'Dead on Film'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: {
    enabled: true
  },
  logging: {
    level: 'info'
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  },
  // Disable agent if license key is not set
  agent_enabled: !!process.env.NEW_RELIC_LICENSE_KEY
}
