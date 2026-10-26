// Cliente del backend. El backend es sin estado: cada llamada envía el CSV + la configuración,
// así se puede escalar a varias réplicas en Kubernetes sin sesiones compartidas.

async function post(path, files, config, { signal, as = 'json' } = {}) {
  const body = new FormData()
  for (const f of [].concat(files)) body.append('file', f) // uno o varios CSV
  body.append('config', JSON.stringify(config))
  const res = await fetch(path, { method: 'POST', body, signal })
  if (!res.ok) {
    const fallback = {
      413: 'The upload exceeds the maximum allowed size.',
      502: 'The server is not available. Please try again in a few seconds.',
      503: 'The server is not available. Please try again in a few seconds.',
      504: 'The server took too long to respond (file too large or too many charts).',
    }
    let msg = fallback[res.status] || `Error ${res.status}`
    try { msg = (await res.json()).error || msg } catch { /* respuesta HTML de NGINX/Ingress */ }
    throw new Error(msg)
  }
  return as === 'blob' ? res.blob() : res.json()
}

export const analyze = (file, config, signal) => post('/api/analyze', file, config, { signal })
export const reportPreview = (file, config) => post('/api/report/preview', file, config)
export const reportXlsx = (file, config) => post('/api/report/xlsx', file, config, { as: 'blob' })

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function b64ToBlob(b64, type) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}
