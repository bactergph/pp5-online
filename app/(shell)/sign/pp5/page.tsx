import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/documents/sign?tab=subject')
}
