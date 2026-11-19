import { teacherGroups, teacherListName } from '@/lib/teacher-order'

type TeacherOption = {
  id: string
  homeroomLevel?: string | null
  prefix?: string | null
  full_name?: string | null
  name?: string | null
}

export default function TeacherOptions<T extends TeacherOption>({ teachers, label }: {
  teachers: T[]
  label?: (teacher: T) => string
}) {
  return teacherGroups(teachers).map(group => (
    <optgroup key={group.key} label={group.label}>
      {group.teachers.map(teacher => (
        <option key={teacher.id} value={teacher.id}>{label ? label(teacher) : teacherListName(teacher)}</option>
      ))}
    </optgroup>
  ))
}
