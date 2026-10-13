import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { varInt, readVarInt, parseStatus, queryServerStatus } from '../dist-electron/server-status.js'

let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
const frame = data => {
  const json = Buffer.from(JSON.stringify(data))
  const packet = Buffer.concat([varInt(0), varInt(json.length), json])
  return Buffer.concat([varInt(packet.length), packet])
}
for (const value of [0, 1, 127, 128, 767, 16384, 0xffffffff]) check(readVarInt(varInt(value)).value, value)
check(readVarInt(Buffer.from([128])), null)
assert.throws(() => readVarInt(Buffer.from([128, 128, 128, 128, 128])));checks++
check(parseStatus(frame({ players: { online: 37, max: 200 } })), { players: 37, maxPlayers: 200 })
check(parseStatus(frame({ players: { online: 0, max: 200 } })), { players: 0, maxPlayers: 200 })
check(parseStatus(frame({ players: { online: 37, max: 200 } }).subarray(0, 7)), null)
for (const players of [{ online: -1, max: 200 }, { online: '37', max: 200 }, { online: 1.5, max: 200 }, null]) {
  assert.throws(() => parseStatus(frame({ players })));checks++
}
assert.throws(() => parseStatus(varInt(1024 * 1024 + 1)));checks++
async function fixture(reply) {
  const clients = new Set()
  const server = createServer(socket => {
    clients.add(socket);socket.on('close', () => clients.delete(socket))
    socket.once('data', request => {
      const handshake = readVarInt(request)
      assert.equal(request[handshake.end], 0)
      const protocol = readVarInt(request, handshake.end + 1)
      assert.equal(protocol.value, 767)
      assert.deepEqual([...request.subarray(handshake.end + handshake.value)], [1, 0])
      reply(socket)
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try { return await queryServerStatus('127.0.0.1', server.address().port, 180) }
  finally { for (const socket of clients) socket.destroy(); await new Promise(resolve => server.close(resolve)) }
}
const online = await fixture(socket => {
  const bytes = frame({ players: { online: 37, max: 200 }, description: 'fixture' })
  socket.write(bytes.subarray(0, 3))
  setTimeout(() => socket.end(bytes.subarray(3)), 10)
})
check(online.state, 'online');check(online.players, 37)
check((await fixture(socket => socket.end())).state, 'unknown')
check((await fixture(socket => socket.end(Buffer.from([1, 2])))).state, 'unknown')
check((await fixture(() => {})).state, 'unknown')
console.log(`PASS: ${checks} status assertions; fragmented Java response, empty close, malformed data and timeout. No external server contacted.`)
