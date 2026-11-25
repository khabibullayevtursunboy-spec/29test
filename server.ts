import express from 'express';
import type { Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase, logActivity } from './src/server/db.ts';
import {
  hashPassword,
  verifyPassword,
  verifyPlainSecret,
  signSessionToken,
  requireAuth,
  type AuthenticatedRequest,
} from './src/server/auth.ts';

dotenv.config();
initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '2mb' }));

// Helper functions
function sanitizeStr(val: unknown, maxLen = 500): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function parsePositiveInt(val: unknown): number | null {
  const n = Number(val);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function computeGrade(percentage: number): string {
  if (percentage >= 86) return '5';
  if (percentage >= 71) return '4';
  if (percentage >= 56) return '3';
  return '2';
}

function normalizeTrueFalse(val: string): string {
  const s = val.trim().toLowerCase().replace(/['`’ʻ‘]/g, '');
  if (['ha', 'yes', 'true', '1', 'togri'].includes(s)) return 'ha';
  if (['yoq', 'no', 'false', '0', 'notogri'].includes(s)) return 'yoq';
  return s;
}

function generateStudentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'STS-';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

function gradeAttemptOnServer(
  attemptId: number,
  statusOverride: 'submitted' | 'timed_out' = 'submitted',
  options?: { isTerminated?: boolean; reason?: string }
): { submittedAt: string } {
  const attempt = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attemptId) as
    | { id: number; test_id: number; student_id: number; status: string; started_at: string; submitted_at: string | null }
    | undefined;
  if (!attempt) {
    throw new Error('Urinish topilmadi.');
  }
  if (attempt.status !== 'in_progress') {
    return { submittedAt: attempt.submitted_at || new Date().toISOString() };
  }

  const test = db.prepare('SELECT id, teacher_id, class_id FROM tests WHERE id = ?').get(attempt.test_id) as
    | { id: number; teacher_id: number; class_id: number }
    | undefined;
  if (!test) {
    throw new Error('Test topilmadi.');
  }

  const questions = db
    .prepare('SELECT id, question_type, points, correct_text_answer FROM questions WHERE test_id = ? ORDER BY order_index ASC, id ASC')
    .all(attempt.test_id) as Array<{
    id: number;
    question_type: 'single_choice' | 'multiple_choice' | 'true_false' | 'text';
    points: number;
    correct_text_answer: string;
  }>;

  const existingAnswers = db
    .prepare('SELECT * FROM student_answers WHERE attempt_id = ?')
    .all(attemptId) as Array<{
    id: number;
    question_id: number;
    selected_option_ids: string;
    text_answer: string;
  }>;

  const answerMap = new Map<number, { selected_option_ids: number[]; text_answer: string }>();
  for (const row of existingAnswers) {
    let parsedIds: number[] = [];
    try {
      const arr = JSON.parse(row.selected_option_ids);
      if (Array.isArray(arr)) {
        parsedIds = arr.map(Number).filter((n) => Number.isInteger(n));
      }
    } catch {
      parsedIds = [];
    }
    answerMap.set(row.question_id, {
      selected_option_ids: parsedIds,
      text_answer: row.text_answer || '',
    });
  }

  let correctCount = 0;
  let wrongCount = 0;
  let earnedPoints = 0;
  let maxPoints = 0;

  const updateAnswerStmt = db.prepare(
    'UPDATE student_answers SET is_correct = ?, earned_points = ? WHERE attempt_id = ? AND question_id = ?'
  );
  const insertEmptyAnswerStmt = db.prepare(
    "INSERT OR IGNORE INTO student_answers (attempt_id, question_id, selected_option_ids, text_answer, is_flagged, is_correct, earned_points) VALUES (?, ?, '[]', '', 0, 0, 0)"
  );

  db.exec('BEGIN');
  try {
    for (const q of questions) {
      maxPoints += q.points;
      const ans = answerMap.get(q.id);
      let isCorrect = false;

      if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
        const correctOptionRows = db
          .prepare('SELECT id FROM answer_options WHERE question_id = ? AND is_correct = 1 ORDER BY id ASC')
          .all(q.id) as Array<{ id: number }>;
        const correctIds = correctOptionRows.map((o) => o.id).sort((a, b) => a - b);
        const selectedIds = Array.from(new Set(ans?.selected_option_ids || [])).sort((a, b) => a - b);

        if (correctIds.length > 0 && selectedIds.length === correctIds.length) {
          isCorrect = correctIds.every((id, idx) => id === selectedIds[idx]);
        }
      } else if (q.question_type === 'true_false') {
        const expected = normalizeTrueFalse(q.correct_text_answer || '');
        const actual = normalizeTrueFalse(ans?.text_answer || '');
        isCorrect = Boolean(expected && actual && expected === actual);
      } else if (q.question_type === 'text') {
        const accepted = (q.correct_text_answer || '')
          .split('|')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const actual = (ans?.text_answer || '').trim().toLowerCase();
        isCorrect = Boolean(actual && accepted.includes(actual));
      }

      if (isCorrect) {
        correctCount += 1;
        earnedPoints += q.points;
      } else {
        wrongCount += 1;
      }

      if (ans) {
        updateAnswerStmt.run(isCorrect ? 1 : 0, isCorrect ? q.points : 0, attemptId, q.id);
      } else {
        insertEmptyAnswerStmt.run(attemptId, q.id);
      }
    }

    const totalQuestions = questions.length;
    const percentage = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 1000) / 10 : 0;
    const grade = computeGrade(percentage);

    const startedMs = new Date(attempt.started_at + (attempt.started_at.endsWith('Z') ? '' : 'Z')).getTime();
    const nowMs = Date.now();
    const timeSpentSeconds = Number.isFinite(startedMs) ? Math.max(1, Math.round((nowMs - startedMs) / 1000)) : 0;
    const submittedAt = new Date().toISOString();

    const isTerminatedFlag = options?.isTerminated ? 1 : 0;
    const terminatedReason = sanitizeStr(options?.reason || '', 300);

    db.prepare(
      'UPDATE test_attempts SET status = ?, submitted_at = ?, duration_seconds = ?, is_terminated = ?, terminated_reason = ? WHERE id = ?'
    ).run(statusOverride, submittedAt, timeSpentSeconds, isTerminatedFlag, terminatedReason, attemptId);

    db.prepare(
      `INSERT OR IGNORE INTO test_results (
        attempt_id, test_id, student_id, teacher_id, class_id,
        total_questions, correct_count, wrong_count,
        earned_points, max_points, percentage, grade, time_spent_seconds, is_terminated, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attemptId,
      test.id,
      attempt.student_id,
      test.teacher_id,
      test.class_id,
      totalQuestions,
      correctCount,
      wrongCount,
      earnedPoints,
      maxPoints,
      percentage,
      grade,
      timeSpentSeconds,
      isTerminatedFlag,
      submittedAt
    );

    db.exec('COMMIT');
    return { submittedAt };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getTestAvailability(test: { status: string; starts_at: string | null; ends_at: string | null }): 'active' | 'upcoming' | 'expired' | 'unavailable' {
  if (test.status === 'blocked' || test.status === 'draft' || test.status === 'archived') {
    return 'unavailable';
  }
  const now = Date.now();
  if (test.starts_at) {
    const startMs = Date.parse(test.starts_at);
    if (Number.isFinite(startMs) && startMs > now) {
      return 'upcoming';
    }
  }
  if (test.ends_at) {
    const endMs = Date.parse(test.ends_at);
    if (Number.isFinite(endMs) && endMs < now) {
      return 'expired';
    }
  }
  if (test.status === 'active' || test.status === 'scheduled') {
    return 'active';
  }
  return 'unavailable';
}

// ==========================================
// PUBLIC ROUTES
// ==========================================
app.get('/api/public/bootstrap', (_req, res: Response) => {
  const classes = db
    .prepare('SELECT id, name, grade_level, section FROM classes WHERE is_active = 1 ORDER BY grade_level ASC, section ASC, name ASC')
    .all();
  const subjects = db
    .prepare('SELECT id, name, description FROM subjects WHERE is_active = 1 ORDER BY name ASC')
    .all();
  const schoolRow = db.prepare("SELECT value FROM system_settings WHERE key = 'school_name'").get() as { value: string } | undefined;
  res.json({
    classes,
    subjects,
    schoolName: schoolRow?.value || 'SCHOOL TEST SYSTEM',
  });
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
app.get('/api/auth/admin/status', (_req, res: Response) => {
  const envPass = sanitizeStr(process.env.ADMIN_PASSWORD, 200);
  const hashRow = db.prepare("SELECT value FROM system_settings WHERE key = 'admin_password_hash'").get() as { value: string } | undefined;
  res.json({
    configured: Boolean(envPass || hashRow?.value),
    envManaged: Boolean(envPass),
  });
});

app.post('/api/auth/admin/claim', (req, res: Response) => {
  const envPass = sanitizeStr(process.env.ADMIN_PASSWORD, 200);
  if (envPass) {
    res.status(403).json({ error: 'Administrator paroli muhit o‘zgaruvchisi orqali sozlangan.' });
    return;
  }
  const existing = db.prepare("SELECT value FROM system_settings WHERE key = 'admin_password_hash'").get() as { value: string } | undefined;
  if (existing?.value) {
    res.status(409).json({ error: 'Administrator paroli allaqachon o‘rnatilgan.' });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 6 || password.length > 128) {
    res.status(400).json({ error: 'Parol kamida 6 ta belgidan iborat bo‘lishi kerak.' });
    return;
  }

  const hashed = hashPassword(password);
  const info = db
    .prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('admin_password_hash', ?)")
    .run(hashed);
  if (info.changes === 0) {
    res.status(409).json({ error: 'Administrator paroli allaqachon o‘rnatilgan.' });
    return;
  }

  logActivity('admin', 'Administrator', 'Administrator paroli dastlabki sozlandi', 'system', 'admin');
  const token = signSessionToken({ role: 'admin', fullName: 'Administrator' });
  res.json({
    token,
    user: { role: 'admin', fullName: 'Administrator' },
  });
});

app.post('/api/auth/admin/login', (req, res: Response) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    res.status(400).json({ error: 'Parolni kiriting.' });
    return;
  }

  const envPass = process.env.ADMIN_PASSWORD || '';
  if (envPass) {
    if (!verifyPlainSecret(password, envPass)) {
      res.status(401).json({ error: 'Administrator paroli noto‘g‘ri.' });
      return;
    }
  } else {
    const hashRow = db.prepare("SELECT value FROM system_settings WHERE key = 'admin_password_hash'").get() as { value: string } | undefined;
    if (!hashRow?.value || !verifyPassword(password, hashRow.value)) {
      res.status(401).json({ error: 'Administrator paroli noto‘g‘ri.' });
      return;
    }
  }

  logActivity('admin', 'Administrator', 'Administrator tizimga kirdi', 'auth', 'admin');
  const token = signSessionToken({ role: 'admin', fullName: 'Administrator' });
  res.json({
    token,
    user: { role: 'admin', fullName: 'Administrator' },
  });
});

app.post('/api/auth/teacher/login', (req, res: Response) => {
  const fullNameInput = sanitizeStr(req.body?.fullName, 120).replace(/\s+/g, ' ');
  const classId = parsePositiveInt(req.body?.classId);
  const subjectId = parsePositiveInt(req.body?.subjectId);

  if (fullNameInput.length < 2 || !classId || !subjectId) {
    res.status(400).json({ error: 'Ismingiz, sinf va faningizni kiriting.' });
    return;
  }

  const cls = db
    .prepare('SELECT id, name, is_active FROM classes WHERE id = ?')
    .get(classId) as { id: number; name: string; is_active: number } | undefined;
  if (!cls || cls.is_active !== 1) {
    res.status(400).json({ error: 'Tanlangan sinf faol emas yoki topilmadi.' });
    return;
  }

  const subj = db
    .prepare('SELECT id, name, is_active FROM subjects WHERE id = ?')
    .get(subjectId) as { id: number; name: string; is_active: number } | undefined;
  if (!subj || subj.is_active !== 1) {
    res.status(400).json({ error: 'Tanlangan fan faol emas yoki topilmadi.' });
    return;
  }

  type TeacherLookupRow = {
    user_id: number;
    username: string;
    full_name: string;
    is_active: number;
    teacher_id: number;
    first_name: string;
    last_name: string;
    subject_names: string;
    assigned_classes: string;
    bio: string;
    phone: string;
  };

  let row = db
    .prepare(
      `SELECT u.id as user_id, u.username, u.full_name, u.is_active,
              t.id as teacher_id, t.first_name, t.last_name, t.subject_names, t.assigned_classes, t.bio, t.phone
       FROM users u
       JOIN teachers t ON t.user_id = u.id
       WHERE LOWER(TRIM(u.full_name)) = ? AND u.role = 'teacher'`
    )
    .get(fullNameInput.toLowerCase()) as TeacherLookupRow | undefined;

  if (row) {
    if (row.is_active !== 1) {
      res.status(403).json({ error: 'Hisobingiz administrator tomonidan vaqtincha bloklangan.' });
      return;
    }

    const existingSubjects = JSON.parse(row.subject_names || '[]') as string[];
    const existingClasses = JSON.parse(row.assigned_classes || '[]') as string[];
    const mergedSubjects = existingSubjects.includes(subj.name)
      ? existingSubjects
      : [...existingSubjects, subj.name];
    const mergedClasses = existingClasses.includes(cls.name)
      ? existingClasses
      : [...existingClasses, cls.name];

    db.prepare('UPDATE teachers SET subject_names = ?, assigned_classes = ? WHERE id = ?').run(
      JSON.stringify(mergedSubjects),
      JSON.stringify(mergedClasses),
      row.teacher_id
    );
    row.subject_names = JSON.stringify(mergedSubjects);
    row.assigned_classes = JSON.stringify(mergedClasses);
  } else {
    const nameParts = fullNameInput.split(' ');
    const firstName = nameParts[0] || fullNameInput;
    const lastName = nameParts.slice(1).join(' ') || 'O‘qituvchi';
    const slug = fullNameInput
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 20) || 'teacher';
    const username = `${slug}.${crypto.randomBytes(2).toString('hex')}`;
    const randomHash = hashPassword(crypto.randomBytes(24).toString('hex'));

    db.exec('BEGIN');
    try {
      const userRes = db
        .prepare("INSERT INTO users (username, password_hash, role, full_name, is_active) VALUES (?, ?, 'teacher', ?, 1)")
        .run(username, randomHash, fullNameInput);
      const userId = Number(userRes.lastInsertRowid);
      const subjectList = JSON.stringify([subj.name]);
      const classList = JSON.stringify([cls.name]);
      const teacherRes = db
        .prepare(
          'INSERT INTO teachers (user_id, first_name, last_name, subject_names, assigned_classes, bio, phone) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(userId, firstName, lastName, subjectList, classList, '', '');
      const teacherId = Number(teacherRes.lastInsertRowid);
      db.exec('COMMIT');

      row = {
        user_id: userId,
        username,
        full_name: fullNameInput,
        is_active: 1,
        teacher_id: teacherId,
        first_name: firstName,
        last_name: lastName,
        subject_names: subjectList,
        assigned_classes: classList,
        bio: '',
        phone: '',
      };
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Teacher login registration error:', err);
      res.status(500).json({ error: 'O‘qituvchi hisobini yaratishda xatolik yuz berdi.' });
      return;
    }
  }

  logActivity('teacher', row.full_name, 'O‘qituvchi tizimga kirdi', 'teacher', String(row.teacher_id), `${cls.name} · ${subj.name}`);

  const token = signSessionToken({
    role: 'teacher',
    userId: row.user_id,
    teacherId: row.teacher_id,
    fullName: row.full_name,
  });

  res.json({
    token,
    user: {
      role: 'teacher',
      userId: row.user_id,
      teacherId: row.teacher_id,
      username: row.username,
      fullName: row.full_name,
      firstName: row.first_name,
      lastName: row.last_name,
      subjectNames: JSON.parse(row.subject_names || '[]'),
      assignedClasses: JSON.parse(row.assigned_classes || '[]'),
      bio: row.bio || '',
      phone: row.phone || '',
      preferredClassId: cls.id,
      preferredSubjectId: subj.id,
    },
  });
});

app.post('/api/auth/student/login', (req, res: Response) => {
  const firstName = sanitizeStr(req.body?.firstName, 60);
  const lastName = sanitizeStr(req.body?.lastName, 60);
  const classId = parsePositiveInt(req.body?.classId);
  const rawCode = sanitizeStr(req.body?.studentCode, 32).toUpperCase();

  if (firstName.length < 2 || lastName.length < 2 || !classId) {
    res.status(400).json({ error: 'Ism, familiya va sinfni to‘g‘ri kiriting.' });
    return;
  }

  const cls = db
    .prepare('SELECT id, name, is_active FROM classes WHERE id = ?')
    .get(classId) as { id: number; name: string; is_active: number } | undefined;
  if (!cls || cls.is_active !== 1) {
    res.status(400).json({ error: 'Tanlangan sinf faol emas yoki topilmadi.' });
    return;
  }

  type StudentLoginRow = {
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    class_id: number;
    student_code: string;
  };

  let student: StudentLoginRow | null = null;

  if (rawCode) {
    const byCode = db
      .prepare('SELECT id, user_id, first_name, last_name, class_id, student_code FROM students WHERE UPPER(student_code) = ?')
      .get(rawCode) as StudentLoginRow | undefined;

    if (byCode) {
      const sameIdentity =
        byCode.first_name.trim().toLowerCase() === firstName.toLowerCase() &&
        byCode.last_name.trim().toLowerCase() === lastName.toLowerCase() &&
        byCode.class_id === classId;
      if (!sameIdentity) {
        res.status(403).json({
          error: 'Kiritilgan o‘quvchi kodi boshqa o‘quvchiga tegishli. Ism, familiya va sinfingizni tekshiring.',
        });
        return;
      }
      student = byCode;
    }
  }

  if (!student) {
    const byIdentity = db
      .prepare(
        'SELECT id, user_id, first_name, last_name, class_id, student_code FROM students WHERE LOWER(TRIM(first_name)) = ? AND LOWER(TRIM(last_name)) = ? AND class_id = ?'
      )
      .get(firstName.toLowerCase(), lastName.toLowerCase(), classId) as StudentLoginRow | undefined;

    if (byIdentity) {
      if (rawCode && byIdentity.student_code.toUpperCase() !== rawCode) {
        res.status(403).json({
          error: 'Bu o‘quvchi uchun avval boshqa individual kod biriktirilgan. O‘z kodingizni kiriting yoki kod maydonini bo‘sh qoldiring.',
        });
        return;
      }
      student = byIdentity;
    }
  }

  if (!student) {
    const studentCode = rawCode || generateStudentCode();
    const fullName = `${firstName} ${lastName}`;
    const username = `student_${studentCode.toLowerCase()}_${crypto.randomBytes(3).toString('hex')}`;
    const randomHash = hashPassword(crypto.randomBytes(24).toString('hex'));

    db.exec('BEGIN');
    try {
      const userRes = db
        .prepare("INSERT INTO users (username, password_hash, role, full_name, is_active) VALUES (?, ?, 'student', ?, 1)")
        .run(username, randomHash, fullName);
      const userId = Number(userRes.lastInsertRowid);
      const stRes = db
        .prepare('INSERT INTO students (user_id, first_name, last_name, class_id, student_code) VALUES (?, ?, ?, ?, ?)')
        .run(userId, firstName, lastName, classId, studentCode);
      const studentId = Number(stRes.lastInsertRowid);
      db.exec('COMMIT');

      student = {
        id: studentId,
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        class_id: classId,
        student_code: studentCode,
      };
      logActivity('student', fullName, 'Yangi o‘quvchi ro‘yxatdan o‘tdi', 'student', String(studentId), cls.name);
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Student registration error:', err);
      res.status(500).json({ error: 'O‘quvchini ro‘yxatdan o‘tkazishda xatolik yuz berdi.' });
      return;
    }
  } else {
    logActivity('student', `${student.first_name} ${student.last_name}`, 'O‘quvchi tizimga kirdi', 'student', String(student.id), cls.name);
  }

  const token = signSessionToken({
    role: 'student',
    userId: student.user_id,
    studentId: student.id,
    classId: student.class_id,
    fullName: `${student.first_name} ${student.last_name}`,
  });

  res.json({
    token,
    user: {
      role: 'student',
      studentId: student.id,
      firstName: student.first_name,
      lastName: student.last_name,
      fullName: `${student.first_name} ${student.last_name}`,
      classId: student.class_id,
      className: cls.name,
      studentCode: student.student_code,
    },
  });
});

app.get('/api/auth/me', requireAuth(), (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.auth });
});

// ==========================================
// STUDENT ROUTES (ZERO GRADE / ANSWER EXPOSURE)
// ==========================================
app.get('/api/student/tests', requireAuth(['student']), (req: AuthenticatedRequest, res: Response) => {
  const studentId = req.auth!.studentId!;
  const classId = req.auth!.classId!;

  const tests = db
    .prepare(
      `SELECT t.id, t.title, t.description, t.duration_minutes, t.max_attempts, t.starts_at, t.ends_at, t.status,
              s.name as subject_name,
              (tr.first_name || ' ' || tr.last_name) as teacher_name,
              (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as question_count
       FROM tests t
       JOIN subjects s ON s.id = t.subject_id
       JOIN teachers tr ON tr.id = t.teacher_id
       WHERE t.class_id = ? AND t.status IN ('active', 'scheduled')
       ORDER BY t.created_at DESC`
    )
    .all(classId) as Array<{
    id: number;
    title: string;
    description: string;
    duration_minutes: number;
    max_attempts: number;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
    subject_name: string;
    teacher_name: string;
    question_count: number;
  }>;

  const result = tests
    .filter((t) => t.question_count > 0)
    .map((t) => {
      const availability = getTestAvailability(t);
      const attempts = db
        .prepare('SELECT id, status, expires_at FROM test_attempts WHERE test_id = ? AND student_id = ? ORDER BY id DESC')
        .all(t.id, studentId) as Array<{ id: number; status: string; expires_at: string }>;

      let inProgressAttemptId: number | null = null;
      let completedAttempts = 0;

      for (const a of attempts) {
        if (a.status === 'in_progress') {
          if (Date.parse(a.expires_at) <= Date.now()) {
            gradeAttemptOnServer(a.id, 'timed_out');
            completedAttempts += 1;
          } else {
            inProgressAttemptId = a.id;
          }
        } else {
          completedAttempts += 1;
        }
      }

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        subjectName: t.subject_name,
        teacherName: t.teacher_name,
        questionCount: t.question_count,
        durationMinutes: t.duration_minutes,
        maxAttempts: t.max_attempts,
        completedAttempts,
        inProgressAttemptId,
        startsAt: t.starts_at,
        endsAt: t.ends_at,
        availability,
        canStart: availability === 'active' && (inProgressAttemptId !== null || completedAttempts < t.max_attempts),
      };
    });

  res.json({ tests: result });
});

app.post('/api/student/tests/:testId/start', requireAuth(['student']), (req: AuthenticatedRequest, res: Response) => {
  const testId = parsePositiveInt(req.params.testId);
  const studentId = req.auth!.studentId!;
  const classId = req.auth!.classId!;

  if (!testId) {
    res.status(400).json({ error: 'Test identifikatori noto‘g‘ri.' });
    return;
  }

  const test = db
    .prepare(
      `SELECT t.id, t.title, t.description, t.duration_minutes, t.max_attempts, t.starts_at, t.ends_at, t.status, t.class_id,
              s.name as subject_name, (tr.first_name || ' ' || tr.last_name) as teacher_name
       FROM tests t
       JOIN subjects s ON s.id = t.subject_id
       JOIN teachers tr ON tr.id = t.teacher_id
       WHERE t.id = ?`
    )
    .get(testId) as
    | {
        id: number;
        title: string;
        description: string;
        duration_minutes: number;
        max_attempts: number;
        starts_at: string | null;
        ends_at: string | null;
        status: string;
        class_id: number;
        subject_name: string;
        teacher_name: string;
      }
    | undefined;

  if (!test || test.class_id !== classId) {
    res.status(404).json({ error: 'Ushbu sinf uchun test topilmadi.' });
    return;
  }

  const availability = getTestAvailability(test);
  if (availability !== 'active') {
    res.status(403).json({
      error:
        availability === 'upcoming'
          ? 'Test hali boshlanmagan.'
          : availability === 'expired'
          ? 'Test topshirish muddati tugagan.'
          : 'Test hozir faol emas.',
    });
    return;
  }

  // Check existing attempts
  const attempts = db
    .prepare('SELECT id, status, expires_at, attempt_number FROM test_attempts WHERE test_id = ? AND student_id = ? ORDER BY id DESC')
    .all(testId, studentId) as Array<{ id: number; status: string; expires_at: string; attempt_number: number }>;

  let activeAttemptId: number | null = null;
  let expiresAt = '';
  let completedCount = 0;

  for (const a of attempts) {
    if (a.status === 'in_progress') {
      if (Date.parse(a.expires_at) <= Date.now()) {
        gradeAttemptOnServer(a.id, 'timed_out');
        completedCount += 1;
      } else {
        activeAttemptId = a.id;
        expiresAt = a.expires_at;
      }
    } else {
      completedCount += 1;
    }
  }

  if (!activeAttemptId) {
    if (completedCount >= test.max_attempts) {
      res.status(403).json({ error: 'Siz ushbu test uchun ruxsat etilgan urinishlar sonidan foydalanib bo‘ldingiz.' });
      return;
    }
    const now = new Date();
    const exp = new Date(now.getTime() + test.duration_minutes * 60 * 1000);
    expiresAt = exp.toISOString();

    const insertAttempt = db
      .prepare(
        "INSERT INTO test_attempts (test_id, student_id, attempt_number, status, started_at, expires_at) VALUES (?, ?, ?, 'in_progress', ?, ?)"
      )
      .run(testId, studentId, completedCount + 1, now.toISOString(), expiresAt);
    activeAttemptId = Number(insertAttempt.lastInsertRowid);

    logActivity('student', req.auth!.fullName, 'Testni boshladi', 'test', String(testId), test.title);
  }

  // IMPORTANT: Explicitly select ONLY non-secret columns (never is_correct or correct_text_answer!)
  const questions = db
    .prepare('SELECT id, order_index, question_type, question_text, points FROM questions WHERE test_id = ? ORDER BY order_index ASC, id ASC')
    .all(testId) as Array<{
    id: number;
    order_index: number;
    question_type: string;
    question_text: string;
    points: number;
  }>;

  if (questions.length === 0) {
    res.status(400).json({ error: 'Testda savollar mavjud emas.' });
    return;
  }

  const optionsStmt = db.prepare(
    'SELECT id, option_text, order_index FROM answer_options WHERE question_id = ? ORDER BY order_index ASC, id ASC'
  );

  const formattedQuestions = questions.map((q) => ({
    id: q.id,
    orderIndex: q.order_index,
    questionType: q.question_type,
    questionText: q.question_text,
    points: q.points,
    options:
      q.question_type === 'single_choice' || q.question_type === 'multiple_choice'
        ? (optionsStmt.all(q.id) as Array<{ id: number; option_text: string; order_index: number }>).map((o) => ({
            id: o.id,
            optionText: o.option_text,
            orderIndex: o.order_index,
          }))
        : [],
  }));

  const savedRows = db
    .prepare('SELECT question_id, selected_option_ids, text_answer, is_flagged FROM student_answers WHERE attempt_id = ?')
    .all(activeAttemptId) as Array<{
    question_id: number;
    selected_option_ids: string;
    text_answer: string;
    is_flagged: number;
  }>;

  const savedAnswers: Record<number, { selectedOptionIds: number[]; textAnswer: string; isFlagged: boolean }> = {};
  for (const row of savedRows) {
    let ids: number[] = [];
    try {
      ids = JSON.parse(row.selected_option_ids);
    } catch {
      ids = [];
    }
    savedAnswers[row.question_id] = {
      selectedOptionIds: Array.isArray(ids) ? ids : [],
      textAnswer: row.text_answer || '',
      isFlagged: row.is_flagged === 1,
    };
  }

  res.json({
    attemptId: activeAttemptId,
    expiresAt,
    serverNow: new Date().toISOString(),
    test: {
      id: test.id,
      title: test.title,
      description: test.description,
      subjectName: test.subject_name,
      teacherName: test.teacher_name,
      durationMinutes: test.duration_minutes,
      questionCount: formattedQuestions.length,
    },
    questions: formattedQuestions,
    savedAnswers,
  });
});

app.put('/api/student/attempts/:attemptId/answer', requireAuth(['student']), (req: AuthenticatedRequest, res: Response) => {
  const attemptId = parsePositiveInt(req.params.attemptId);
  const questionId = parsePositiveInt(req.body?.questionId);
  const studentId = req.auth!.studentId!;

  if (!attemptId || !questionId) {
    res.status(400).json({ error: 'So‘rov parametrlari noto‘g‘ri.' });
    return;
  }

  const attempt = db
    .prepare('SELECT id, test_id, student_id, status, expires_at FROM test_attempts WHERE id = ?')
    .get(attemptId) as
    | { id: number; test_id: number; student_id: number; status: string; expires_at: string }
    | undefined;

  if (!attempt || attempt.student_id !== studentId) {
    res.status(403).json({ error: 'Urinishga kirish huquqi yo‘q.' });
    return;
  }

  if (attempt.status !== 'in_progress') {
    res.status(409).json({ error: 'Test allaqachon yakunlangan.' });
    return;
  }

  // Allow 10s network grace before hard rejection
  if (Date.parse(attempt.expires_at) + 10000 < Date.now()) {
    gradeAttemptOnServer(attemptId, 'timed_out');
    res.status(409).json({ error: 'Ajratilgan vaqt tugadi.', timedOut: true });
    return;
  }

  const q = db.prepare('SELECT id FROM questions WHERE id = ? AND test_id = ?').get(questionId, attempt.test_id);
  if (!q) {
    res.status(400).json({ error: 'Savol ushbu testga tegishli emas.' });
    return;
  }

  const selectedOptionIds = Array.isArray(req.body?.selectedOptionIds)
    ? req.body.selectedOptionIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  const textAnswer = sanitizeStr(req.body?.textAnswer, 1000);
  const isFlagged = req.body?.isFlagged ? 1 : 0;

  db.prepare(
    `INSERT INTO student_answers (attempt_id, question_id, selected_option_ids, text_answer, is_flagged, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(attempt_id, question_id) DO UPDATE SET
       selected_option_ids = excluded.selected_option_ids,
       text_answer = excluded.text_answer,
       is_flagged = excluded.is_flagged,
       updated_at = datetime('now')`
  ).run(attemptId, questionId, JSON.stringify(selectedOptionIds), textAnswer, isFlagged);

  res.json({ saved: true });
});

app.post('/api/student/attempts/:attemptId/violation', requireAuth(['student']), (req: AuthenticatedRequest, res: Response) => {
  const attemptId = parsePositiveInt(req.params.attemptId);
  const studentId = req.auth!.studentId!;
  const eventType = sanitizeStr(req.body?.eventType, 40);
  const details = sanitizeStr(req.body?.details, 300);

  if (!attemptId || !['tab_hidden', 'window_blur', 'tab_returned'].includes(eventType)) {
    res.status(400).json({ error: 'Hodisa ma’lumotlari noto‘g‘ri.' });
    return;
  }

  const attempt = db
    .prepare(
      `SELECT a.id, a.test_id, a.student_id, a.status, t.teacher_id, t.title
       FROM test_attempts a
       JOIN tests t ON t.id = a.test_id
       WHERE a.id = ?`
    )
    .get(attemptId) as
    | { id: number; test_id: number; student_id: number; status: string; teacher_id: number; title: string }
    | undefined;

  if (!attempt || attempt.student_id !== studentId) {
    res.status(403).json({ error: 'Ruxsat yo‘q.' });
    return;
  }
  if (attempt.status !== 'in_progress') {
    res.json({ logged: false, terminated: true });
    return;
  }

  const occurredAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO violation_logs (attempt_id, test_id, student_id, teacher_id, event_type, details, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(attemptId, attempt.test_id, studentId, attempt.teacher_id, eventType, details, occurredAt);

  const shouldTerminate = eventType === 'tab_hidden' || eventType === 'window_blur';
  if (shouldTerminate) {
    gradeAttemptOnServer(attemptId, 'submitted', {
      isTerminated: true,
      reason: details || 'Boshqa oyna yoki tabga o‘tildi',
    });
    logActivity(
      'student',
      req.auth!.fullName,
      'Boshqa oynaga o‘tgani sababli testdan chiqarildi',
      'test',
      String(attempt.test_id),
      attempt.title
    );
    res.json({
      logged: true,
      terminated: true,
      occurredAt,
      message: 'Boshqa oyna yoki tabga o‘tganingiz sababli testdan chiqarildingiz!',
    });
    return;
  }

  logActivity('student', req.auth!.fullName, `Nazorat ogohlantirishi: ${eventType}`, 'test', String(attempt.test_id), attempt.title);
  res.json({ logged: true, terminated: false, occurredAt });
});

app.post('/api/student/attempts/:attemptId/submit', requireAuth(['student']), (req: AuthenticatedRequest, res: Response) => {
  const attemptId = parsePositiveInt(req.params.attemptId);
  const studentId = req.auth!.studentId!;
  const timedOut = Boolean(req.body?.timedOut);

  if (!attemptId) {
    res.status(400).json({ error: 'Urinish identifikatori noto‘g‘ri.' });
    return;
  }

  const attempt = db
    .prepare('SELECT id, test_id, student_id, status FROM test_attempts WHERE id = ?')
    .get(attemptId) as { id: number; test_id: number; student_id: number; status: string } | undefined;

  if (!attempt || attempt.student_id !== studentId) {
    res.status(403).json({ error: 'Ushbu urinishni yakunlash huquqingiz yo‘q.' });
    return;
  }

  const { submittedAt } = gradeAttemptOnServer(attemptId, timedOut ? 'timed_out' : 'submitted');
  logActivity('student', req.auth!.fullName, 'Testni yakunladi', 'attempt', String(attemptId));

  // STRICT SECURITY: NEVER return score, correctCount, wrongCount, percentage, or grade to student!
  res.json({
    success: true,
    message: 'Test muvaffaqiyatli yakunlandi!',
    submittedAt,
  });
});

// ==========================================
// TEACHER ROUTES
// ==========================================
app.get('/api/teacher/meta', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const teacher = db
    .prepare(
      `SELECT t.*, u.username FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = ?`
    )
    .get(teacherId) as
    | {
        id: number;
        user_id: number;
        username: string;
        first_name: string;
        last_name: string;
        subject_names: string;
        assigned_classes: string;
        bio: string;
        phone: string;
      }
    | undefined;

  const classes = db
    .prepare('SELECT id, name, grade_level, section FROM classes WHERE is_active = 1 ORDER BY grade_level ASC, section ASC')
    .all();
  const subjects = db
    .prepare('SELECT id, name, description FROM subjects WHERE is_active = 1 ORDER BY name ASC')
    .all();
  const schoolRow = db.prepare("SELECT value FROM system_settings WHERE key = 'school_name'").get() as { value: string } | undefined;

  res.json({
    teacher: teacher
      ? {
          id: teacher.id,
          username: teacher.username,
          firstName: teacher.first_name,
          lastName: teacher.last_name,
          fullName: `${teacher.first_name} ${teacher.last_name}`,
          subjectNames: JSON.parse(teacher.subject_names || '[]'),
          assignedClasses: JSON.parse(teacher.assigned_classes || '[]'),
          bio: teacher.bio || '',
          phone: teacher.phone || '',
        }
      : null,
    classes,
    subjects,
    schoolName: schoolRow?.value || 'SCHOOL TEST SYSTEM',
  });
});

app.get('/api/teacher/dashboard', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;

  const totals = db
    .prepare(
      `SELECT
        COUNT(*) as total_tests,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_tests,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_tests
       FROM tests WHERE teacher_id = ?`
    )
    .get(teacherId) as { total_tests: number; active_tests: number | null; archived_tests: number | null };

  const participantsRow = db
    .prepare(
      `SELECT COUNT(DISTINCT tr.student_id) as total_students, COUNT(*) as total_submissions,
              COALESCE(AVG(tr.percentage), 0) as avg_percentage
       FROM test_results tr WHERE tr.teacher_id = ?`
    )
    .get(teacherId) as { total_students: number; total_submissions: number; avg_percentage: number };

  const finishedTestsRow = db
    .prepare(
      `SELECT COUNT(DISTINCT test_id) as finished_tests FROM test_results WHERE teacher_id = ?`
    )
    .get(teacherId) as { finished_tests: number };

  const unreadViolationsRow = db
    .prepare('SELECT COUNT(*) as cnt FROM violation_logs WHERE teacher_id = ? AND reviewed_by_teacher = 0')
    .get(teacherId) as { cnt: number };

  const classStats = db
    .prepare(
      `SELECT c.name as class_name,
              COUNT(tr.id) as submissions,
              ROUND(AVG(tr.percentage), 1) as avg_percentage
       FROM test_results tr
       JOIN classes c ON c.id = tr.class_id
       WHERE tr.teacher_id = ?
       GROUP BY c.id, c.name
       ORDER BY c.grade_level ASC, c.section ASC`
    )
    .all(teacherId);

  const gradeDistribution = db
    .prepare(
      `SELECT grade, COUNT(*) as count FROM test_results WHERE teacher_id = ? GROUP BY grade ORDER BY grade DESC`
    )
    .all(teacherId);

  const recentTests = db
    .prepare(
      `SELECT t.id, t.title, t.status, t.duration_minutes, t.created_at,
              s.name as subject_name, c.name as class_name,
              (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as question_count,
              (SELECT COUNT(*) FROM test_results r WHERE r.test_id = t.id) as submission_count
       FROM tests t
       JOIN subjects s ON s.id = t.subject_id
       JOIN classes c ON c.id = t.class_id
       WHERE t.teacher_id = ?
       ORDER BY t.created_at DESC
       LIMIT 6`
    )
    .all(teacherId);

  res.json({
    stats: {
      totalTests: totals.total_tests || 0,
      activeTests: totals.active_tests || 0,
      finishedTests: finishedTestsRow.finished_tests || 0,
      totalParticipants: participantsRow.total_students || 0,
      totalSubmissions: participantsRow.total_submissions || 0,
      avgPercentage: Math.round((participantsRow.avg_percentage || 0) * 10) / 10,
      unreadViolations: unreadViolationsRow.cnt || 0,
    },
    classStats,
    gradeDistribution,
    recentTests,
  });
});

app.get('/api/teacher/tests', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const rows = db
    .prepare(
      `SELECT t.*, s.name as subject_name, c.name as class_name,
              (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as question_count,
              (SELECT COUNT(*) FROM test_results r WHERE r.test_id = t.id) as submission_count
       FROM tests t
       JOIN subjects s ON s.id = t.subject_id
       JOIN classes c ON c.id = t.class_id
       WHERE t.teacher_id = ?
       ORDER BY t.created_at DESC`
    )
    .all(teacherId);
  res.json({ tests: rows });
});

app.get('/api/teacher/tests/:id', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const testId = parsePositiveInt(req.params.id);
  if (!testId) {
    res.status(400).json({ error: 'Test identifikatori noto‘g‘ri.' });
    return;
  }

  const test = db.prepare('SELECT * FROM tests WHERE id = ? AND teacher_id = ?').get(testId, teacherId) as any;
  if (!test) {
    res.status(404).json({ error: 'Test topilmadi.' });
    return;
  }

  const questions = db
    .prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY order_index ASC, id ASC')
    .all(testId) as any[];
  const optStmt = db.prepare('SELECT * FROM answer_options WHERE question_id = ? ORDER BY order_index ASC, id ASC');

  const fullQuestions = questions.map((q) => ({
    id: q.id,
    orderIndex: q.order_index,
    questionType: q.question_type,
    questionText: q.question_text,
    points: q.points,
    correctTextAnswer: q.correct_text_answer || '',
    options: (optStmt.all(q.id) as any[]).map((o) => ({
      id: o.id,
      optionText: o.option_text,
      isCorrect: o.is_correct === 1,
      orderIndex: o.order_index,
    })),
  }));

  res.json({ test, questions: fullQuestions });
});

function saveTestPayload(
  teacherId: number,
  body: any,
  existingTestId?: number
): { testId: number } {
  const title = sanitizeStr(body?.title, 200);
  const description = sanitizeStr(body?.description, 1000);
  const subjectId = parsePositiveInt(body?.subjectId);
  const classId = parsePositiveInt(body?.classId);
  const durationMinutes = Math.max(1, Math.min(300, Number(body?.durationMinutes) || 30));
  const maxAttempts = Math.max(1, Math.min(20, Number(body?.maxAttempts) || 1));
  const startsAt = sanitizeStr(body?.startsAt, 64) || null;
  const endsAt = sanitizeStr(body?.endsAt, 64) || null;
  const rawStatus = sanitizeStr(body?.status, 20);
  const status = ['draft', 'scheduled', 'active'].includes(rawStatus) ? rawStatus : 'draft';
  const questions = Array.isArray(body?.questions) ? body.questions : [];

  if (!title || !subjectId || !classId) {
    throw new Error('Test nomi, fan va sinf majburiy.');
  }
  if (questions.length === 0) {
    throw new Error('Kamida bitta savol qo‘shing.');
  }

  const subjectExists = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId);
  const classExists = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
  if (!subjectExists || !classExists) {
    throw new Error('Tanlangan fan yoki sinf topilmadi.');
  }

  db.exec('BEGIN');
  try {
    let testId: number;
    if (existingTestId) {
      const current = db.prepare('SELECT id, status FROM tests WHERE id = ? AND teacher_id = ?').get(existingTestId, teacherId) as
        | { id: number; status: string }
        | undefined;
      if (!current) {
        throw new Error('Test topilmadi yoki tahrirlash huquqingiz yo‘q.');
      }
      const nextStatus = current.status === 'blocked' ? 'blocked' : status;
      db.prepare(
        `UPDATE tests
         SET subject_id = ?, class_id = ?, title = ?, description = ?, duration_minutes = ?,
             max_attempts = ?, starts_at = ?, ends_at = ?, status = ?, updated_at = datetime('now')
         WHERE id = ? AND teacher_id = ?`
      ).run(subjectId, classId, title, description, durationMinutes, maxAttempts, startsAt, endsAt, nextStatus, existingTestId, teacherId);

      // Replace questions only if test has no attempts yet OR replace safely
      db.prepare('DELETE FROM questions WHERE test_id = ?').run(existingTestId);
      testId = existingTestId;
    } else {
      const res = db
        .prepare(
          `INSERT INTO tests (teacher_id, subject_id, class_id, title, description, duration_minutes, max_attempts, starts_at, ends_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(teacherId, subjectId, classId, title, description, durationMinutes, maxAttempts, startsAt, endsAt, status);
      testId = Number(res.lastInsertRowid);
    }

    const insertQ = db.prepare(
      'INSERT INTO questions (test_id, order_index, question_type, question_text, points, correct_text_answer) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertOpt = db.prepare(
      'INSERT INTO answer_options (question_id, option_text, is_correct, order_index) VALUES (?, ?, ?, ?)'
    );

    questions.forEach((q: any, idx: number) => {
      const qType = ['single_choice', 'multiple_choice', 'true_false', 'text'].includes(q?.questionType)
        ? q.questionType
        : 'single_choice';
      const qText = sanitizeStr(q?.questionText, 2000);
      const points = Math.max(1, Math.min(100, Number(q?.points) || 1));
      const correctText = sanitizeStr(q?.correctTextAnswer, 500);

      if (!qText) {
        throw new Error(`${idx + 1}-savol matni bo‘sh bo‘lishi mumkin emas.`);
      }

      if (qType === 'true_false' && !['ha', 'yoq'].includes(normalizeTrueFalse(correctText))) {
        throw new Error(`${idx + 1}-savol uchun to‘g‘ri javob (Ha yoki Yo‘q) tanlanishi kerak.`);
      }

      if (qType === 'text' && !correctText) {
        throw new Error(`${idx + 1}-savol uchun to‘g‘ri matnli javobni kiriting.`);
      }

      const qRes = insertQ.run(testId, idx, qType, qText, points, qType === 'true_false' ? normalizeTrueFalse(correctText) : correctText);
      const qId = Number(qRes.lastInsertRowid);

      if (qType === 'single_choice' || qType === 'multiple_choice') {
        const opts = Array.isArray(q?.options) ? q.options : [];
        if (opts.length < 2) {
          throw new Error(`${idx + 1}-savolda kamida 2 ta javob varianti bo‘lishi kerak.`);
        }
        const hasCorrect = opts.some((o: any) => Boolean(o?.isCorrect));
        if (!hasCorrect) {
          throw new Error(`${idx + 1}-savolda kamida 1 ta to‘g‘ri javob belgilanishi kerak.`);
        }
        opts.forEach((o: any, oIdx: number) => {
          const optText = sanitizeStr(o?.optionText, 500);
          if (!optText) {
            throw new Error(`${idx + 1}-savolning ${oIdx + 1}-varianti bo‘sh.`);
          }
          insertOpt.run(qId, optText, o?.isCorrect ? 1 : 0, oIdx);
        });
      }
    });

    db.exec('COMMIT');
    return { testId };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

app.post('/api/teacher/tests', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  try {
    const { testId } = saveTestPayload(teacherId, req.body);
    logActivity('teacher', req.auth!.fullName, 'Yangi test yaratdi', 'test', String(testId), sanitizeStr(req.body?.title, 120));
    res.status(201).json({ id: testId, message: 'Test muvaffaqiyatli yaratildi.' });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Test yaratishda xatolik.' });
  }
});

app.put('/api/teacher/tests/:id', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const testId = parsePositiveInt(req.params.id);
  if (!testId) {
    res.status(400).json({ error: 'Test identifikatori noto‘g‘ri.' });
    return;
  }
  try {
    saveTestPayload(teacherId, req.body, testId);
    logActivity('teacher', req.auth!.fullName, 'Testni tahrirladi', 'test', String(testId), sanitizeStr(req.body?.title, 120));
    res.json({ id: testId, message: 'Test muvaffaqiyatli yangilandi.' });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Testni yangilashda xatolik.' });
  }
});

app.patch('/api/teacher/tests/:id/status', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const testId = parsePositiveInt(req.params.id);
  const status = sanitizeStr(req.body?.status, 20);
  if (!testId || !['draft', 'scheduled', 'active', 'archived'].includes(status)) {
    res.status(400).json({ error: 'Holat noto‘g‘ri.' });
    return;
  }
  const existing = db.prepare('SELECT id, status, title FROM tests WHERE id = ? AND teacher_id = ?').get(testId, teacherId) as
    | { id: number; status: string; title: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Test topilmadi.' });
    return;
  }
  if (existing.status === 'blocked') {
    res.status(403).json({ error: 'Ushbu test administrator tomonidan vaqtincha bloklangan.' });
    return;
  }
  db.prepare("UPDATE tests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, testId);
  logActivity('teacher', req.auth!.fullName, `Test holatini o‘zgartirdi (${status})`, 'test', String(testId), existing.title);
  res.json({ success: true, status });
});

app.delete('/api/teacher/tests/:id', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const testId = parsePositiveInt(req.params.id);
  if (!testId) {
    res.status(400).json({ error: 'Test identifikatori noto‘g‘ri.' });
    return;
  }
  const existing = db.prepare('SELECT id, title FROM tests WHERE id = ? AND teacher_id = ?').get(testId, teacherId) as
    | { id: number; title: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Test topilmadi.' });
    return;
  }
  db.prepare('DELETE FROM tests WHERE id = ? AND teacher_id = ?').run(testId, teacherId);
  logActivity('teacher', req.auth!.fullName, 'Testni o‘chirdi', 'test', String(testId), existing.title);
  res.json({ success: true });
});

app.get('/api/teacher/results', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const classId = parsePositiveInt(req.query.classId);
  const subjectId = parsePositiveInt(req.query.subjectId);
  const testId = parsePositiveInt(req.query.testId);

  let sql = `
    SELECT r.id, r.attempt_id, r.test_id, r.student_id, r.total_questions, r.correct_count, r.wrong_count,
           r.earned_points, r.max_points, r.percentage, r.grade, r.time_spent_seconds, r.submitted_at,
           COALESCE(r.is_terminated, a.is_terminated, 0) as is_terminated,
           st.first_name, st.last_name, st.student_code,
           c.id as class_id, c.name as class_name,
           t.title as test_title, s.id as subject_id, s.name as subject_name,
           a.started_at, a.status as attempt_status, a.terminated_reason,
           (SELECT COUNT(*) FROM violation_logs v WHERE v.attempt_id = r.attempt_id AND v.event_type != 'tab_returned') as violation_count
    FROM test_results r
    JOIN students st ON st.id = r.student_id
    JOIN classes c ON c.id = r.class_id
    JOIN tests t ON t.id = r.test_id
    JOIN subjects s ON s.id = t.subject_id
    JOIN test_attempts a ON a.id = r.attempt_id
    WHERE r.teacher_id = ?
  `;
  const params: Array<number> = [teacherId];

  if (classId) {
    sql += ' AND r.class_id = ?';
    params.push(classId);
  }
  if (subjectId) {
    sql += ' AND t.subject_id = ?';
    params.push(subjectId);
  }
  if (testId) {
    sql += ' AND r.test_id = ?';
    params.push(testId);
  }

  sql += ' ORDER BY r.submitted_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ results: rows });
});

app.get('/api/teacher/statistics', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const testStats = db
    .prepare(
      `SELECT t.id, t.title, s.name as subject_name, c.name as class_name,
              COUNT(r.id) as submissions,
              ROUND(COALESCE(AVG(r.percentage), 0), 1) as avg_percentage,
              MAX(r.percentage) as max_percentage,
              MIN(r.percentage) as min_percentage,
              SUM(CASE WHEN r.grade = '5' THEN 1 ELSE 0 END) as grade_5,
              SUM(CASE WHEN r.grade = '4' THEN 1 ELSE 0 END) as grade_4,
              SUM(CASE WHEN r.grade = '3' THEN 1 ELSE 0 END) as grade_3,
              SUM(CASE WHEN r.grade = '2' THEN 1 ELSE 0 END) as grade_2
       FROM tests t
       JOIN subjects s ON s.id = t.subject_id
       JOIN classes c ON c.id = t.class_id
       LEFT JOIN test_results r ON r.test_id = t.id
       WHERE t.teacher_id = ?
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    )
    .all(teacherId);

  const questionAccuracy = db
    .prepare(
      `SELECT q.id, q.question_text, t.title as test_title,
              COUNT(sa.id) as total_answers,
              SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers
       FROM questions q
       JOIN tests t ON t.id = q.test_id
       JOIN student_answers sa ON sa.question_id = q.id
       JOIN test_attempts a ON a.id = sa.attempt_id AND a.status != 'in_progress'
       WHERE t.teacher_id = ?
       GROUP BY q.id
       HAVING total_answers > 0
       ORDER BY (CAST(correct_answers AS REAL) / total_answers) ASC
       LIMIT 10`
    )
    .all(teacherId);

  res.json({ testStats, questionAccuracy });
});

app.get('/api/teacher/violations', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const rows = db
    .prepare(
      `SELECT v.*, st.first_name, st.last_name, st.student_code, c.name as class_name, t.title as test_title,
              a.is_terminated
       FROM violation_logs v
       JOIN students st ON st.id = v.student_id
       JOIN classes c ON c.id = st.class_id
       JOIN tests t ON t.id = v.test_id
       JOIN test_attempts a ON a.id = v.attempt_id
       WHERE v.teacher_id = ?
       ORDER BY v.occurred_at DESC
       LIMIT 200`
    )
    .all(teacherId);
  res.json({ violations: rows });
});

app.patch('/api/teacher/violations/:id/review', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Identifikator noto‘g‘ri.' });
    return;
  }
  db.prepare('UPDATE violation_logs SET reviewed_by_teacher = 1 WHERE id = ? AND teacher_id = ?').run(id, teacherId);
  res.json({ success: true });
});

app.put('/api/teacher/profile', requireAuth(['teacher']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.auth!.teacherId!;
  const userId = req.auth!.userId!;
  const firstName = sanitizeStr(req.body?.firstName, 60);
  const lastName = sanitizeStr(req.body?.lastName, 60);
  const bio = sanitizeStr(req.body?.bio, 500);
  const phone = sanitizeStr(req.body?.phone, 40);
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';

  if (firstName.length < 2 || lastName.length < 2) {
    res.status(400).json({ error: 'Ism va familiyani kiriting.' });
    return;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak.' });
      return;
    }
    const userRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
    if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
      res.status(400).json({ error: 'Joriy parol noto‘g‘ri.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, full_name = ? WHERE id = ?').run(
      hashPassword(newPassword),
      `${firstName} ${lastName}`,
      userId
    );
  } else {
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(`${firstName} ${lastName}`, userId);
  }

  db.prepare('UPDATE teachers SET first_name = ?, last_name = ?, bio = ?, phone = ? WHERE id = ?').run(
    firstName,
    lastName,
    bio,
    phone,
    teacherId
  );

  res.json({ success: true, fullName: `${firstName} ${lastName}` });
});

// ==========================================
// ADMIN ROUTES
// ==========================================
app.get('/api/admin/dashboard', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const teachers = (db.prepare('SELECT COUNT(*) as cnt FROM teachers').get() as { cnt: number }).cnt;
  const tests = (db.prepare('SELECT COUNT(*) as cnt FROM tests').get() as { cnt: number }).cnt;
  const activeTests = (db.prepare("SELECT COUNT(*) as cnt FROM tests WHERE status = 'active'").get() as { cnt: number }).cnt;
  const students = (db.prepare('SELECT COUNT(*) as cnt FROM students').get() as { cnt: number }).cnt;
  const submissions = (db.prepare('SELECT COUNT(*) as cnt FROM test_results').get() as { cnt: number }).cnt;
  const violations = (db.prepare("SELECT COUNT(*) as cnt FROM violation_logs WHERE event_type != 'tab_returned'").get() as { cnt: number }).cnt;

  const recentActivity = db
    .prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 12')
    .all();

  const testsBySubject = db
    .prepare(
      `SELECT s.name as subject_name, COUNT(t.id) as test_count
       FROM subjects s
       LEFT JOIN tests t ON t.subject_id = s.id
       GROUP BY s.id
       ORDER BY test_count DESC`
    )
    .all();

  res.json({
    stats: { teachers, tests, activeTests, students, submissions, violations },
    recentActivity,
    testsBySubject,
  });
});

app.get('/api/admin/teachers', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(
      `SELECT t.*, u.username, u.is_active, u.full_name,
              (SELECT COUNT(*) FROM tests ts WHERE ts.teacher_id = t.id) as test_count
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC`
    )
    .all() as any[];

  res.json({
    teachers: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      firstName: r.first_name,
      lastName: r.last_name,
      fullName: r.full_name,
      isActive: r.is_active === 1,
      subjectNames: JSON.parse(r.subject_names || '[]'),
      assignedClasses: JSON.parse(r.assigned_classes || '[]'),
      bio: r.bio || '',
      phone: r.phone || '',
      testCount: r.test_count,
      createdAt: r.created_at,
    })),
  });
});

app.post('/api/admin/teachers', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const username = sanitizeStr(req.body?.username, 80).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const firstName = sanitizeStr(req.body?.firstName, 60);
  const lastName = sanitizeStr(req.body?.lastName, 60);
  const phone = sanitizeStr(req.body?.phone, 40);
  const bio = sanitizeStr(req.body?.bio, 500);
  const subjectNames = Array.isArray(req.body?.subjectNames)
    ? req.body.subjectNames.map((s: unknown) => sanitizeStr(s, 80)).filter(Boolean)
    : [];
  const assignedClasses = Array.isArray(req.body?.assignedClasses)
    ? req.body.assignedClasses.map((s: unknown) => sanitizeStr(s, 40)).filter(Boolean)
    : [];

  if (!username || username.length < 3 || !/^[a-z0-9_.-]+$/.test(username)) {
    res.status(400).json({ error: 'Login kamida 3 ta lotin harfi, raqam yoki _ . - belgisidan iborat bo‘lishi kerak.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Parol kamida 6 ta belgidan iborat bo‘lishi kerak.' });
    return;
  }
  if (firstName.length < 2 || lastName.length < 2) {
    res.status(400).json({ error: 'O‘qituvchi ismi va familiyasini kiriting.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
  if (existing) {
    res.status(409).json({ error: 'Bu login allaqachon band.' });
    return;
  }

  const fullName = `${firstName} ${lastName}`;
  const hashed = hashPassword(password);

  db.exec('BEGIN');
  try {
    const userRes = db
      .prepare("INSERT INTO users (username, password_hash, role, full_name, is_active) VALUES (?, ?, 'teacher', ?, 1)")
      .run(username, hashed, fullName);
    const userId = Number(userRes.lastInsertRowid);
    const teacherRes = db
      .prepare(
        'INSERT INTO teachers (user_id, first_name, last_name, subject_names, assigned_classes, bio, phone) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(userId, firstName, lastName, JSON.stringify(subjectNames), JSON.stringify(assignedClasses), bio, phone);
    db.exec('COMMIT');

    logActivity('admin', 'Administrator', 'Yangi o‘qituvchi qo‘shdi', 'teacher', String(teacherRes.lastInsertRowid), fullName);
    res.status(201).json({ id: Number(teacherRes.lastInsertRowid), message: 'O‘qituvchi muvaffaqiyatli qo‘shildi.' });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Create teacher error:', err);
    res.status(500).json({ error: 'O‘qituvchi qo‘shishda xatolik.' });
  }
});

app.put('/api/admin/teachers/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = parsePositiveInt(req.params.id);
  if (!teacherId) {
    res.status(400).json({ error: 'Identifikator noto‘g‘ri.' });
    return;
  }

  const teacher = db.prepare('SELECT id, user_id FROM teachers WHERE id = ?').get(teacherId) as
    | { id: number; user_id: number }
    | undefined;
  if (!teacher) {
    res.status(404).json({ error: 'O‘qituvchi topilmadi.' });
    return;
  }

  const firstName = sanitizeStr(req.body?.firstName, 60);
  const lastName = sanitizeStr(req.body?.lastName, 60);
  const phone = sanitizeStr(req.body?.phone, 40);
  const bio = sanitizeStr(req.body?.bio, 500);
  const isActive = req.body?.isActive === false ? 0 : 1;
  const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  const subjectNames = Array.isArray(req.body?.subjectNames)
    ? req.body.subjectNames.map((s: unknown) => sanitizeStr(s, 80)).filter(Boolean)
    : [];
  const assignedClasses = Array.isArray(req.body?.assignedClasses)
    ? req.body.assignedClasses.map((s: unknown) => sanitizeStr(s, 40)).filter(Boolean)
    : [];

  if (firstName.length < 2 || lastName.length < 2) {
    res.status(400).json({ error: 'Ism va familiya kiritilishi shart.' });
    return;
  }
  if (newPassword && newPassword.length < 6) {
    res.status(400).json({ error: 'Parol kamida 6 ta belgidan iborat bo‘lishi kerak.' });
    return;
  }

  const fullName = `${firstName} ${lastName}`;
  db.exec('BEGIN');
  try {
    if (newPassword) {
      db.prepare('UPDATE users SET full_name = ?, is_active = ?, password_hash = ? WHERE id = ?').run(
        fullName,
        isActive,
        hashPassword(newPassword),
        teacher.user_id
      );
    } else {
      db.prepare('UPDATE users SET full_name = ?, is_active = ? WHERE id = ?').run(fullName, isActive, teacher.user_id);
    }
    db.prepare(
      'UPDATE teachers SET first_name = ?, last_name = ?, subject_names = ?, assigned_classes = ?, bio = ?, phone = ? WHERE id = ?'
    ).run(firstName, lastName, JSON.stringify(subjectNames), JSON.stringify(assignedClasses), bio, phone, teacherId);
    db.exec('COMMIT');

    logActivity('admin', 'Administrator', 'O‘qituvchi ma’lumotlarini yangiladi', 'teacher', String(teacherId), fullName);
    res.json({ success: true });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Update teacher error:', err);
    res.status(500).json({ error: 'Yangilashda xatolik.' });
  }
});

app.delete('/api/admin/teachers/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const teacherId = parsePositiveInt(req.params.id);
  if (!teacherId) {
    res.status(400).json({ error: 'Identifikator noto‘g‘ri.' });
    return;
  }
  const teacher = db.prepare('SELECT id, user_id, first_name, last_name FROM teachers WHERE id = ?').get(teacherId) as
    | { id: number; user_id: number; first_name: string; last_name: string }
    | undefined;
  if (!teacher) {
    res.status(404).json({ error: 'O‘qituvchi topilmadi.' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(teacher.user_id);
  logActivity('admin', 'Administrator', 'O‘qituvchini o‘chirdi', 'teacher', String(teacherId), `${teacher.first_name} ${teacher.last_name}`);
  res.json({ success: true });
});

app.get('/api/admin/tests', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(
      `SELECT t.*, s.name as subject_name, c.name as class_name,
              (tr.first_name || ' ' || tr.last_name) as teacher_name,
              (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) as question_count,
              (SELECT COUNT(*) FROM test_results r WHERE r.test_id = t.id) as submission_count
       FROM tests t
       JOIN subjects s ON s.id = t.subject_id
       JOIN classes c ON c.id = t.class_id
       JOIN teachers tr ON tr.id = t.teacher_id
       ORDER BY t.created_at DESC`
    )
    .all();
  res.json({ tests: rows });
});

app.patch('/api/admin/tests/:id/status', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const testId = parsePositiveInt(req.params.id);
  const status = sanitizeStr(req.body?.status, 20);
  if (!testId || !['draft', 'scheduled', 'active', 'blocked', 'archived'].includes(status)) {
    res.status(400).json({ error: 'Holat noto‘g‘ri.' });
    return;
  }
  const existing = db.prepare('SELECT id, title FROM tests WHERE id = ?').get(testId) as { id: number; title: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Test topilmadi.' });
    return;
  }
  db.prepare("UPDATE tests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, testId);
  logActivity('admin', 'Administrator', `Test holatini o‘zgartirdi (${status})`, 'test', String(testId), existing.title);
  res.json({ success: true, status });
});

app.delete('/api/admin/tests/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const testId = parsePositiveInt(req.params.id);
  if (!testId) {
    res.status(400).json({ error: 'Identifikator noto‘g‘ri.' });
    return;
  }
  const existing = db.prepare('SELECT id, title FROM tests WHERE id = ?').get(testId) as { id: number; title: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Test topilmadi.' });
    return;
  }
  db.prepare('DELETE FROM tests WHERE id = ?').run(testId);
  logActivity('admin', 'Administrator', 'Testni o‘chirdi', 'test', String(testId), existing.title);
  res.json({ success: true });
});

app.get('/api/admin/results', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const classId = parsePositiveInt(req.query.classId);
  const subjectId = parsePositiveInt(req.query.subjectId);
  const teacherId = parsePositiveInt(req.query.teacherId);
  const testId = parsePositiveInt(req.query.testId);

  let sql = `
    SELECT r.*, COALESCE(r.is_terminated, a.is_terminated, 0) as is_terminated,
           st.first_name, st.last_name, st.student_code,
           c.name as class_name, t.title as test_title, s.name as subject_name,
           (tr.first_name || ' ' || tr.last_name) as teacher_name,
           a.started_at, a.status as attempt_status, a.terminated_reason,
           (SELECT COUNT(*) FROM violation_logs v WHERE v.attempt_id = r.attempt_id AND v.event_type != 'tab_returned') as violation_count
    FROM test_results r
    JOIN students st ON st.id = r.student_id
    JOIN classes c ON c.id = r.class_id
    JOIN tests t ON t.id = r.test_id
    JOIN subjects s ON s.id = t.subject_id
    JOIN teachers tr ON tr.id = r.teacher_id
    JOIN test_attempts a ON a.id = r.attempt_id
    WHERE 1=1
  `;
  const params: number[] = [];
  if (classId) {
    sql += ' AND r.class_id = ?';
    params.push(classId);
  }
  if (subjectId) {
    sql += ' AND t.subject_id = ?';
    params.push(subjectId);
  }
  if (teacherId) {
    sql += ' AND r.teacher_id = ?';
    params.push(teacherId);
  }
  if (testId) {
    sql += ' AND r.test_id = ?';
    params.push(testId);
  }
  sql += ' ORDER BY r.submitted_at DESC';
  res.json({ results: db.prepare(sql).all(...params) });
});

app.get('/api/admin/classes', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) as student_count,
              (SELECT COUNT(*) FROM tests t WHERE t.class_id = c.id) as test_count
       FROM classes c ORDER BY c.grade_level ASC, c.section ASC, c.name ASC`
    )
    .all();
  res.json({ classes: rows });
});

app.post('/api/admin/classes', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const gradeLevel = parsePositiveInt(req.body?.gradeLevel);
  const section = sanitizeStr(req.body?.section, 10).toUpperCase();
  const customName = sanitizeStr(req.body?.name, 20);
  const name = customName || (gradeLevel && section ? `${gradeLevel}-${section}` : '');

  if (!name || !gradeLevel || gradeLevel < 1 || gradeLevel > 12 || !section) {
    res.status(400).json({ error: 'Sinf darajasi (1–12) va harfini kiriting.' });
    return;
  }
  const dup = db.prepare('SELECT id FROM classes WHERE UPPER(name) = ?').get(name.toUpperCase());
  if (dup) {
    res.status(409).json({ error: 'Bu sinf allaqachon mavjud.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO classes (name, grade_level, section, is_active) VALUES (?, ?, ?, 1)')
    .run(name, gradeLevel, section);
  logActivity('admin', 'Administrator', 'Yangi sinf qo‘shdi', 'class', String(info.lastInsertRowid), name);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/classes/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  const name = sanitizeStr(req.body?.name, 20);
  const gradeLevel = parsePositiveInt(req.body?.gradeLevel);
  const section = sanitizeStr(req.body?.section, 10).toUpperCase();
  const isActive = req.body?.isActive === false ? 0 : 1;

  if (!id || !name || !gradeLevel || !section) {
    res.status(400).json({ error: 'Sinf ma’lumotlari noto‘g‘ri.' });
    return;
  }
  db.prepare('UPDATE classes SET name = ?, grade_level = ?, section = ?, is_active = ? WHERE id = ?').run(
    name,
    gradeLevel,
    section,
    isActive,
    id
  );
  logActivity('admin', 'Administrator', 'Sinfni yangiladi', 'class', String(id), name);
  res.json({ success: true });
});

app.delete('/api/admin/classes/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Identifikator noto‘g‘ri.' });
    return;
  }
  const usedInTests = (db.prepare('SELECT COUNT(*) as cnt FROM tests WHERE class_id = ?').get(id) as { cnt: number }).cnt;
  const usedInStudents = (db.prepare('SELECT COUNT(*) as cnt FROM students WHERE class_id = ?').get(id) as { cnt: number }).cnt;
  if (usedInTests > 0 || usedInStudents > 0) {
    res.status(409).json({
      error: 'Bu sinfga o‘quvchilar yoki testlar bog‘langan. O‘chirish o‘rniga faolsizlantiring.',
    });
    return;
  }
  db.prepare('DELETE FROM classes WHERE id = ?').run(id);
  logActivity('admin', 'Administrator', 'Sinfni o‘chirdi', 'class', String(id));
  res.json({ success: true });
});

app.get('/api/admin/subjects', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM tests t WHERE t.subject_id = s.id) as test_count
       FROM subjects s ORDER BY s.name ASC`
    )
    .all();
  res.json({ subjects: rows });
});

app.post('/api/admin/subjects', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const name = sanitizeStr(req.body?.name, 100);
  const description = sanitizeStr(req.body?.description, 300);
  if (name.length < 2) {
    res.status(400).json({ error: 'Fan nomini kiriting.' });
    return;
  }
  const dup = db.prepare('SELECT id FROM subjects WHERE LOWER(name) = ?').get(name.toLowerCase());
  if (dup) {
    res.status(409).json({ error: 'Bu fan allaqachon mavjud.' });
    return;
  }
  const info = db.prepare('INSERT INTO subjects (name, description, is_active) VALUES (?, ?, 1)').run(name, description);
  logActivity('admin', 'Administrator', 'Yangi fan qo‘shdi', 'subject', String(info.lastInsertRowid), name);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/subjects/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  const name = sanitizeStr(req.body?.name, 100);
  const description = sanitizeStr(req.body?.description, 300);
  const isActive = req.body?.isActive === false ? 0 : 1;
  if (!id || name.length < 2) {
    res.status(400).json({ error: 'Fan ma’lumotlari noto‘g‘ri.' });
    return;
  }
  db.prepare('UPDATE subjects SET name = ?, description = ?, is_active = ? WHERE id = ?').run(name, description, isActive, id);
  logActivity('admin', 'Administrator', 'Fanni yangiladi', 'subject', String(id), name);
  res.json({ success: true });
});

app.delete('/api/admin/subjects/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Identifikator noto‘g‘ri.' });
    return;
  }
  const used = (db.prepare('SELECT COUNT(*) as cnt FROM tests WHERE subject_id = ?').get(id) as { cnt: number }).cnt;
  if (used > 0) {
    res.status(409).json({ error: 'Bu fanga tegishli testlar mavjud. O‘chirish o‘rniga faolsizlantiring.' });
    return;
  }
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  logActivity('admin', 'Administrator', 'Fanni o‘chirdi', 'subject', String(id));
  res.json({ success: true });
});

app.get('/api/admin/students', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const rows = db
    .prepare(
      `SELECT st.*, c.name as class_name,
              (SELECT COUNT(*) FROM test_attempts a WHERE a.student_id = st.id) as attempt_count
       FROM students st
       JOIN classes c ON c.id = st.class_id
       ORDER BY st.created_at DESC`
    )
    .all();
  res.json({ students: rows });
});

app.put('/api/admin/students/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  const firstName = sanitizeStr(req.body?.firstName, 60);
  const lastName = sanitizeStr(req.body?.lastName, 60);
  const classId = parsePositiveInt(req.body?.classId);
  const studentCode = sanitizeStr(req.body?.studentCode, 32).toUpperCase();

  if (!id || firstName.length < 2 || lastName.length < 2 || !classId || !studentCode) {
    res.status(400).json({ error: 'O‘quvchi ma’lumotlari to‘liq emas.' });
    return;
  }
  const dup = db.prepare('SELECT id FROM students WHERE UPPER(student_code) = ? AND id != ?').get(studentCode, id);
  if (dup) {
    res.status(409).json({ error: 'Bu o‘quvchi kodi boshqa o‘quvchiga biriktirilgan.' });
    return;
  }
  db.prepare('UPDATE students SET first_name = ?, last_name = ?, class_id = ?, student_code = ? WHERE id = ?').run(
    firstName,
    lastName,
    classId,
    studentCode,
    id
  );
  res.json({ success: true });
});

app.delete('/api/admin/students/:id', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Identifikator noto‘g‘ri.' });
    return;
  }
  const st = db.prepare('SELECT user_id FROM students WHERE id = ?').get(id) as { user_id: number | null } | undefined;
  if (!st) {
    res.status(404).json({ error: 'O‘quvchi topilmadi.' });
    return;
  }
  if (st.user_id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(st.user_id);
  } else {
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
  }
  logActivity('admin', 'Administrator', 'O‘quvchini o‘chirdi', 'student', String(id));
  res.json({ success: true });
});

app.get('/api/admin/activity', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const activityLogs = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 150').all();
  const violationLogs = db
    .prepare(
      `SELECT v.*, st.first_name, st.last_name, st.student_code, c.name as class_name,
              t.title as test_title, (tr.first_name || ' ' || tr.last_name) as teacher_name
       FROM violation_logs v
       JOIN students st ON st.id = v.student_id
       JOIN classes c ON c.id = st.class_id
       JOIN tests t ON t.id = v.test_id
       JOIN teachers tr ON tr.id = v.teacher_id
       ORDER BY v.occurred_at DESC
       LIMIT 150`
    )
    .all();
  res.json({ activityLogs, violationLogs });
});

app.get('/api/admin/settings', requireAuth(['admin']), (_req: AuthenticatedRequest, res: Response) => {
  const schoolRow = db.prepare("SELECT value FROM system_settings WHERE key = 'school_name'").get() as { value: string } | undefined;
  res.json({
    schoolName: schoolRow?.value || 'SCHOOL TEST SYSTEM',
    envManagedPassword: Boolean(process.env.ADMIN_PASSWORD),
  });
});

app.put('/api/admin/settings', requireAuth(['admin']), (req: AuthenticatedRequest, res: Response) => {
  const schoolName = sanitizeStr(req.body?.schoolName, 120);
  if (schoolName.length >= 2) {
    db.prepare(
      "INSERT INTO system_settings (key, value, updated_at) VALUES ('school_name', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(schoolName);
  }
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (newPassword) {
    if (process.env.ADMIN_PASSWORD) {
      res.status(400).json({ error: 'Administrator paroli muhit o‘zgaruvchisi orqali boshqariladi.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak.' });
      return;
    }
    db.prepare(
      "INSERT INTO system_settings (key, value, updated_at) VALUES ('admin_password_hash', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(hashPassword(newPassword));
  }
  logActivity('admin', 'Administrator', 'Tizim sozlamalarini yangiladi', 'system', 'settings');
  res.json({ success: true });
});

// ==========================================
// SERVER STARTUP (VITE DEV OR STATIC DIST)
// ==========================================
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SCHOOL TEST SYSTEM server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
