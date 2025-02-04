import Keycloak from 'keycloak-js'

export default defineNuxtPlugin(async () => {
  const rtc = useRuntimeConfig().public

  // define new keycloak
  const keycloak = new Keycloak({
    url: rtc.keycloakAuthUrl,
    realm: rtc.keycloakRealm,
    clientId: rtc.keycloakClientId
  })

  try {
    // init keycloak instance
    await keycloak.init({
      onLoad: 'check-sso',
      responseMode: 'query',
      pkceMethod: 'S256'
    })
  } catch (error) {
    console.error('Failed to initialize Keycloak adapter: ', error)
  }

  // default behaviour when keycloak session expires
  // try to update token - log out if token update fails
  keycloak.onTokenExpired = async () => {
    await keycloak.updateToken(minValidity).catch(() => {
      console.error('Failed to refresh token on expiration; logging out.')
      keycloak.logout()
    })
  }

  const refreshIntervalTimeout = rtc.tokenRefreshInterval as number
  const minValidity = toValue((rtc.tokenMinValidity as number) / 1000) // convert to seconds
  const idleTimeout = rtc.sessionIdleTimeout as number
  const modalTimeout = rtc.sessionExpiredModalTimeout as number
  let modalTimeoutId: ReturnType<typeof setTimeout> | null = null

  const route = useRoute()
  const { idle } = useIdle(idleTimeout)

  function resetSessionTimeout () {
    if (modalTimeoutId) {
      clearTimeout(modalTimeoutId)
      modalTimeoutId = null
    }
  }

  // executed when user is authenticated and idle = true
  // if route meta provided, override default behaviour
  function sessionExpiredFn () {
    if (route.meta.onSessionExpired) {
      route.meta.onSessionExpired()
    } else {
      useConnectModals().openSessionExpiringModal(resetSessionTimeout)

      // cleanup modal timeout if exists
      resetSessionTimeout()

      // start countdown until user logged out
      modalTimeoutId = setTimeout(async () => {
        if (route.meta.onBeforeSessionExpired) {
          await route.meta.onBeforeSessionExpired()
        }
        sessionStorage.setItem(ConnectStorageKeys.CONNECT_SESSION_EXPIRED, 'true')
        keycloak.logout()
      }, modalTimeout)
    }
  }

  function scheduleRefreshToken () {
    setTimeout(async () => {
      // do not refresh if user not authenticated or idle
      if (!keycloak.authenticated || idle.value) {
        console.info('User unauthenticated or inactive, stopping token refresh schedule.')
        return
      }

      if (keycloak.isTokenExpired(minValidity)) {
        console.info('Token set to expire soon. Refreshing token...')
        try {
          await keycloak.updateToken(minValidity)
          console.info('Token updated.')
        } catch (error) {
          console.error('Error updating token:', error)
          keycloak.logout() // log user out if token update fails
        }
      }
      // re-schedule only if the user remains active and authenticated
      if (keycloak.authenticated && !idle.value) {
        scheduleRefreshToken()
      }
    }, refreshIntervalTimeout)
  }

  // Watch for changes in authentication and idle state
  // When the user is authenticated and not idle, start the refresh schedule
  // Execute session expiry handling if user authenticated and inactive
  watch(
    [() => keycloak.authenticated, () => idle.value],
    ([isAuth, isIdle]) => {
      if (isAuth) {
        sessionStorage.removeItem(ConnectStorageKeys.CONNECT_SESSION_EXPIRED)
        if (!isIdle) {
          scheduleRefreshToken()
        } else {
          sessionExpiredFn()
        }
      }
    },
    { immediate: true }
  )

  return {
    provide: {
      // provide global keycloak instance
      keycloak
    }
  }
})
