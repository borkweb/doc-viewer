export function score(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = target.toLowerCase()
  if (!t) return 0

  let next = 0
  let total = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1
    for (let ti = next; ti < t.length; ti++) {
      if (t[ti] === ch) {
        found = ti
        break
      }
    }
    if (found === -1) return 0

    let points = 1
    if (found === next) {
      streak += 1
      points += streak * 2
    } else {
      streak = 0
    }
    if (found === 0) points += 5
    else if (/[\s/_.-]/.test(t[found - 1])) points += 3

    const gap = found - next
    if (gap > 0) points -= Math.min(gap, 3)
    total += points
    next = found + 1
  }

  if (t.startsWith(q)) total += 10
  if (t === q) total += 10
  total += Math.round((q.length / t.length) * 5)
  return Math.max(total, 1)
}
