'use client'

import { useEffect, useState } from 'react'

interface Audit {
  _id: string
  title: string
  description: string
  status: string
  createdAt: string
}

export default function Audits() {
  const [audits, setAudits] = useState<Audit[]>([])

  useEffect(() => {
    fetch('/api/audits')
      .then(res => res.json())
      .then(data => setAudits(data))
  }, [])

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-4">Auditorías de Casos de Uso IA</h1>
      <ul>
        {audits.map(audit => (
          <li key={audit._id} className="mb-2">
            <h2 className="text-xl">{audit.title}</h2>
            <p>{audit.description}</p>
            <p>Status: {audit.status}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}