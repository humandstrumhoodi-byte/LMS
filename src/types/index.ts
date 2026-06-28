export type Role = 'superadmin' | 'center_manager' | 'teacher'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  phone?: string
  created_at: string
}

export interface Student {
  id: string
  full_name: string
  email?: string
  phone?: string
  joined_date?: string
  created_at: string
}

export interface Subject {
  id: string
  name: string
  code: string
  level?: string
  color: string
  teacher_id?: string
  created_at: string
}

export interface StudentSubject {
  id: string
  student_id: string
  subject_id: string
}

export interface ClassSchedule {
  id: string
  subject_id: string
  day_of_week: string
  start_time: string
  duration_minutes: number
  created_at: string
}

export interface ScheduleStudent {
  schedule_id: string
  student_id: string
}

export interface FeeStructure {
  id: string
  subject_id: string
  amount: number
  frequency: string
  due_day: number
}

export interface Payment {
  id: string
  student_id: string
  subject_id: string
  amount: number
  payment_date?: string
  status: 'paid' | 'pending' | 'overdue'
  month_label: string
  notes?: string
  created_at: string
}

// ─── RBAC ────────────────────────────────────────────────────
export interface Perms {
  manageUsers: boolean      // create/delete/change roles
  manageTeachers: boolean   // add teacher accounts
  manageStudents: boolean
  manageSubjects: boolean
  manageSchedule: boolean
  manageFees: boolean
  managePayments: boolean
  viewPayments: boolean
  viewOwnSchedule: boolean  // teacher sees only their classes
}

export const ROLE_PERMS: Record<Role, Perms> = {
  superadmin: {
    manageUsers: true, manageTeachers: true, manageStudents: true,
    manageSubjects: true, manageSchedule: true, manageFees: true,
    managePayments: true, viewPayments: true, viewOwnSchedule: true,
  },
  center_manager: {
    manageUsers: false, manageTeachers: true, manageStudents: true,
    manageSubjects: true, manageSchedule: true, manageFees: true,
    managePayments: true, viewPayments: true, viewOwnSchedule: true,
  },
  teacher: {
    manageUsers: false, manageTeachers: false, manageStudents: false,
    manageSubjects: false, manageSchedule: false, manageFees: false,
    managePayments: false, viewPayments: false, viewOwnSchedule: true,
  },
}

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Super Admin',
  center_manager: 'Center Manager',
  teacher: 'Teacher',
}

export const ROLE_COLOR: Record<Role, string> = {
  superadmin: 'bg-purple-100 text-purple-800',
  center_manager: 'bg-blue-100 text-blue-800',
  teacher: 'bg-emerald-100 text-emerald-800',
}

export const DAYS = ['Sun','Tue','Wed','Thu','Fri','Sat'] // Mon is holiday, Sun is working day
export const TIMES = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00']
export const COLORS = ['violet','sky','emerald','amber','rose','indigo']
