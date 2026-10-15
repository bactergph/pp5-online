export type FreeScheduleAd = {
  title: string
  href: string
  imageUrl: string
  start: string
  end: string
}

export const emptyFreeScheduleAd: FreeScheduleAd = { title: '', href: '', imageUrl: '', start: '', end: '' }

export function bangkokToday(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function safeHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

export function freeAdIsLive(ad: FreeScheduleAd, today = bangkokToday()) {
  const ready = Boolean(ad.title.trim() || safeHttpUrl(ad.href) || safeHttpUrl(ad.imageUrl))
  return ready && Boolean(ad.start) && Boolean(ad.end) && ad.start <= ad.end && today >= ad.start && today <= ad.end
}
