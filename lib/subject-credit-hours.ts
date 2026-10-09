/** Secondary credits are per semester; existing annual consumers use a 40-week equivalent. */
export function secondaryCreditHours(value: unknown) {
  const credits = Number(value)
  if (!Number.isFinite(credits) || credits <= 0 || credits > 50 || !Number.isInteger(credits * 2)) {
    throw new Error('กรุณาระบุหน่วยกิตตั้งแต่ 0.5 และเพิ่มครั้งละ 0.5')
  }
  return { credits, weekly: credits * 2, semester: credits * 40, annual: credits * 80 }
}
