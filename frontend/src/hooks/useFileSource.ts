import { useState, useEffect } from 'react'

export function useFileSource(filePath: string | null) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!filePath) {
      setContent(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setContent(null)
    fetch(`${import.meta.env.BASE_URL}api/source?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setContent(data.content)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filePath])

  return { content, loading, error }
}
