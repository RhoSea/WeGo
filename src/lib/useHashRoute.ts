import { useCallback, useEffect, useState } from 'react'

function currentHash(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function useHashRoute(): [string, (path: string) => void] {
  const [route, setRoute] = useState(currentHash)

  useEffect(() => {
    const onChange = () => setRoute(currentHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((path: string) => {
    window.location.hash = path
    setRoute(path)
  }, [])

  return [route, navigate]
}

/** Returns the token from a '/join/<token>' route, or null. */
export function parseJoinToken(route: string): string | null {
  const match = /^\/join\/(.+)$/.exec(route)
  return match ? decodeURIComponent(match[1]) : null
}
