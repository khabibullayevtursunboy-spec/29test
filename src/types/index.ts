export type UserRole = 'admin' | 'teacher' | 'student';

export interface SchoolClass {
  id: number;
  name: string;
  grade_level: number;
  section: string;
  is_active?: number;
  student_count?: number;
  test_count?: number;
}

export interface SubjectItem {
  id: number;
  name: string;
  description: string;
  is_active?: number;
  test_count?: number;
}

export interface StudentUser {
  role: 'student';
  studentId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  classId: number;
  className: string;
  studentCode: string;
}

export interface TeacherUser {
  role: 'teacher';
  userId: number;
  teacherId: number;
  username: string;
  fullName: string;
  firstName: string;
  lastName: string;
  subjectNames: string[];
  assignedClasses: string[];
  bio: string;
  phone: string;
  preferredClassId?: number;
  preferredSubjectId?: number;
}

export interface AdminUser {
  role: 'admin';
  fullName: string;
}

export type SessionUser = StudentUser | TeacherUser | AdminUser;

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'text';

export interface StudentTestCard {
  id: number;
  title: string;
  description: string;
  subjectName: string;
  teacherName: string;
  questionCount: number;
  durationMinutes: number;
  maxAttempts: number;
  completedAttempts: number;
  inProgressAttemptId: number | null;
  startsAt: string | null;
  endsAt: string | null;
  availability: 'active' | 'upcoming' | 'expired' | 'unavailable';
  canStart: boolean;
}

export interface StudentQuestion {
  id: number;
  orderIndex: number;
  questionType: QuestionType;
  questionText: string;
  points: number;
  options: Array<{
    id: number;
    optionText: string;
    orderIndex: number;
  }>;
}

export interface StudentAnswerDraft {
  selectedOptionIds: number[];
  textAnswer: string;
  isFlagged: boolean;
}

export interface TeacherQuestionDraft {
  id?: number;
  questionType: QuestionType;
  questionText: string;
  points: number;
  correctTextAnswer: string;
  options: Array<{
    id?: number;
    optionText: string;
    isCorrect: boolean;
  }>;
}

export interface TestRecord {
  id: number;
  teacher_id: number;
  subject_id: number;
  class_id: number;
  title: string;
  description: string;
  duration_minutes: number;
  max_attempts: number;
  starts_at: string | null;
  ends_at: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'blocked' | 'archived';
  subject_name: string;
  class_name: string;
  teacher_name?: string;
  question_count: number;
  submission_count: number;
  created_at: string;
}

export interface TestResultRow {
  id: number;
  attempt_id: number;
  test_id: number;
  student_id: number;
  total_questions: number;
  correct_count: number;
  wrong_count: number;
  earned_points: number;
  max_points: number;
  percentage: number;
  grade: string;
  time_spent_seconds: number;
  submitted_at: string;
  started_at: string;
  first_name: string;
  last_name: string;
  student_code: string;
  class_id: number;
  class_name: string;
  test_title: string;
  subject_id?: number;
  subject_name: string;
  teacher_name?: string;
  violation_count: number;
  is_terminated?: number;
  terminated_reason?: string;
  attempt_status?: string;
}

export interface ViolationLogRow {
  id: number;
  attempt_id: number;
  test_id: number;
  student_id: number;
  teacher_id: number;
  event_type: 'tab_hidden' | 'window_blur' | 'tab_returned';
  details: string;
  occurred_at: string;
  reviewed_by_teacher: number;
  first_name: string;
  last_name: string;
  student_code: string;
  class_name: string;
  test_title: string;
  teacher_name?: string;
  is_terminated?: number;
}
