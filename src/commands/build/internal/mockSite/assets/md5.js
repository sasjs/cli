// Compact MD5 (RFC 1321) returning lowercase hex. Used by the crypto shim so
// that dcMockUtils' mp_hashdataset sees the same digests SAS produces.
const MD5 = (() => {
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21
  ]
  const K = new Array(64)
  for (let i = 0; i < 64; i++)
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0

  const rotl = (x, c) => (x << c) | (x >>> (32 - c))

  return function md5(input) {
    const bytes = new TextEncoder().encode(String(input))
    const bitLen = bytes.length * 8
    const withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64)
    withPad.set(bytes)
    withPad[bytes.length] = 0x80
    const dv = new DataView(withPad.buffer)
    dv.setUint32(withPad.length - 8, bitLen >>> 0, true)
    dv.setUint32(withPad.length - 4, Math.floor(bitLen / 4294967296), true)

    let a0 = 0x67452301,
      b0 = 0xefcdab89,
      c0 = 0x98badcfe,
      d0 = 0x10325476

    for (let off = 0; off < withPad.length; off += 64) {
      const M = new Array(16)
      for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true)
      let A = a0,
        B = b0,
        C = c0,
        D = d0
      for (let i = 0; i < 64; i++) {
        let F, g
        if (i < 16) {
          F = (B & C) | (~B & D)
          g = i
        } else if (i < 32) {
          F = (D & B) | (~D & C)
          g = (5 * i + 1) % 16
        } else if (i < 48) {
          F = B ^ C ^ D
          g = (3 * i + 5) % 16
        } else {
          F = C ^ (B | ~D)
          g = (7 * i) % 16
        }
        const tmp = D
        D = C
        C = B
        B = (B + rotl((A + F + K[i] + M[g]) | 0, S[i])) | 0
        A = tmp
      }
      a0 = (a0 + A) | 0
      b0 = (b0 + B) | 0
      c0 = (c0 + C) | 0
      d0 = (d0 + D) | 0
    }

    const hex = (n) => {
      let out = ''
      for (let i = 0; i < 4; i++)
        out += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
      return out
    }
    return hex(a0) + hex(b0) + hex(c0) + hex(d0)
  }
})()

if (typeof module !== 'undefined') module.exports = MD5
