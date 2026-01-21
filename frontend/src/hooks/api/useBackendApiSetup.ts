/**
 * Backend API setup hook
 * Fetches initial configuration data on mount: health, config, integrations status
 */

import { useEffect, useState } from 'react'
import type { HealthStatus, ConfigStatus, IntegrationsStatus } from '@/types'
import { getBackendUrl } from '@/utils/backend'

export type BackendApiSetupResult = {
  health: HealthStatus
  config: ConfigStatus
  setConfig: (config: ConfigStatus) => void
  integrationsStatus: IntegrationsStatus | null
  error: string | null
  loading: boolean
}

/**
 * Initialize backend configuration on component mount
 * Fetches health status, app config, and integration status in parallel
 */
export function useBackendApiSetup(): BackendApiSetupResult {
  const [health, setHealth] = useState<HealthStatus>(null)
  const [config, setConfig] = useState<ConfigStatus>(null)
  const [integrationsStatus, setIntegrationsStatus] = useState<IntegrationsStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      const backendUrl = getBackendUrl()
      let healthOk = false
      let configOk = false
      let integOk = false

      try {
        const healthRes = await fetch(`${backendUrl}/health`)
        if (healthRes.ok) {
          const healthData = await healthRes.json()
          setHealth(healthData)
          healthOk = true
        } else {
          setError('Backend health check failed')
        }
      } catch (e) {
        setError('Cannot connect to backend (health)')
      }

      try {
        const configRes = await fetch(`${backendUrl}/config`)
        if (configRes.ok) {
          const configData = await configRes.json()
          setConfig(configData)
          configOk = true
        } else {
          setError('Failed to load configuration')
        }
      } catch (e) {
        if (!healthOk) setError('Cannot connect to backend')
      }

      try {
        const integRes = await fetch(`${backendUrl}/integrations/status`)
        if (integRes.ok) {
          const integData = await integRes.json()
          setIntegrationsStatus(integData)
          integOk = true
        }
      } catch (e) {
        // Integration status is optional, don't set error
      }

      setLoading(false)
    }

    fetchAll()
  }, [])

  return {
    health,
    config,
    setConfig,
    integrationsStatus,
    error,
    loading,
  }
}
