/** Rough strength estimate — deliberately simple (no big dictionary library). */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: '' }
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[֐-׿]/.test(pw)) pool += 27
  if (/[^a-zA-Z0-9֐-׿]/.test(pw)) pool += 20
  const unique = new Set(pw).size
  const bits = Math.log2(Math.max(pool, 2)) * Math.min(pw.length, unique * 2)
  if (pw.length < 10 || bits < 45) return { score: 1, label: 'Weak — use a longer passphrase' }
  if (bits < 70) return { score: 2, label: 'OK — longer is better' }
  return { score: 3, label: 'Strong' }
}

export const MIN_PASSWORD = 10
