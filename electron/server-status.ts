import { createConnection } from 'node:net'

export type ServerStatus =
  | { state: 'online'; players: number; maxPlayers: number; checkedAt: number }
  | { state: 'unknown'; checkedAt: number }

export function varInt(value: number): Buffer {
  const bytes: number[] = []
  let remaining = value >>> 0
  do {
    let byte = remaining & 0x7f
    remaining >>>= 7
    if (remaining) byte |= 0x80
    bytes.push(byte)
  } while (remaining)
  return Buffer.from(bytes)
}

export function readVarInt(bytes: Buffer, start = 0): { value: number; end: number } | null {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (start + i >= bytes.length) return null
    const byte = bytes[start + i]
    value |= (byte & 0x7f) << (7 * i)
    if (!(byte & 0x80)) return { value: value >>> 0, end: start + i + 1 }
  }
  throw new Error('VarInt invalide')
}

export function parseStatus(bytes: Buffer): { players: number; maxPlayers: number } | null {
  const frame = readVarInt(bytes)
  if (!frame) return null
  if (frame.value > 1024 * 1024) throw new Error('Réponse trop grande')
  if (bytes.length < frame.end + frame.value) return null
  const packet = bytes.subarray(frame.end, frame.end + frame.value)
  const id = readVarInt(packet)
  if (!id || id.value !== 0) throw new Error('Paquet inattendu')
  const length = readVarInt(packet, id.end)
  if (!length || length.end + length.value !== packet.length) throw new Error('Réponse incomplète')
  const data = JSON.parse(packet.subarray(length.end).toString('utf8')) as { players?: { online?: unknown; max?: unknown } }
  const players = data.players?.online, maxPlayers = data.players?.max
  if (typeof players !== 'number' || !Number.isSafeInteger(players) || players < 0 ||
      typeof maxPlayers !== 'number' || !Number.isSafeInteger(maxPlayers) || maxPlayers < 0)
    throw new Error('Compteurs invalides')
  return { players, maxPlayers }
}

// Vanilla Java Server List Ping. Only the main process's configured server is
// contacted; the renderer cannot submit arbitrary hosts or retrieve player names.
// A failed query is UNKNOWN, never a fabricated offline/zero-player result.
export function queryServerStatus(host: string, port: number, timeoutMs = 5000): Promise<ServerStatus> {
  return new Promise(resolve => {
    let finished = false, bytes = Buffer.alloc(0)
    const socket = createConnection({ host, port })
    const finish = (result: ServerStatus) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }
    const unknown = () => finish({ state: 'unknown', checkedAt: Date.now() })
    const timer = setTimeout(unknown, timeoutMs)
    socket.on('error', unknown)
    socket.on('end', unknown)
    socket.on('close', unknown)
    socket.on('connect', () => {
      const address = Buffer.from(host, 'utf8'), portBytes = Buffer.alloc(2)
      portBytes.writeUInt16BE(port)
      const handshake = Buffer.concat([varInt(0), varInt(767), varInt(address.length), address, portBytes, varInt(1)])
      socket.write(Buffer.concat([varInt(handshake.length), handshake, Buffer.from([1, 0])]))
    })
    socket.on('data', chunk => {
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      if (bytes.length + data.length > 1024 * 1024 + 5) return unknown()
      bytes = Buffer.concat([bytes, data])
      try {
        const result = parseStatus(bytes)
        if (result) finish({ state: 'online', ...result, checkedAt: Date.now() })
      } catch { unknown() }
    })
  })
}
