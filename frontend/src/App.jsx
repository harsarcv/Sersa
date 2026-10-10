
import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL

    async function checkApi() {
      try {
        const response = await fetch(`${apiUrl}/api/health`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || 'API tidak tersedia')
        }

        setHealth(data)
      } catch (err) {
        setError(err.message || 'Gagal menghubungi API')
      } finally {
        setLoading(false)
      }
    }

    checkApi()
  }, [])

  return (
    <main style={{ maxWidth: 720, margin: '60px auto', padding: 24 }}>
      <h1>Sersa</h1>
      <p>Service Business Management Platform</p>

      <hr />

      <h2>Status koneksi production</h2>

      {loading && <p>Mengecek koneksi API...</p>}

      {error && (
        <p style={{ color: 'crimson' }}>
          Koneksi gagal: {error}
        </p>
      )}

      {health && (
        <section>
          <p>Status API: {health.status}</p>
          <p>Status database: {health.database}</p>
          <p>Nama database: {health.databaseName}</p>
          <p>Waktu server: {health.serverTime}</p>
        </section>
      )}
    </main>
  )
}

export default App
