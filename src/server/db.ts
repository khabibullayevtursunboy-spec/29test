import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'school_test.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
      full_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      grade_level INTEGER NOT NULL CHECK (grade_level >= 1 AND grade_level <= 12),
      section TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      student_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      subject_names TEXT NOT NULL DEFAULT '[]',
      assigned_classes TEXT NOT NULL DEFAULT '[]',
      bio TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes >= 1 AND duration_minutes <= 300),
      max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1 AND max_attempts <= 20),
      starts_at TEXT DEFAULT NULL,
      ends_at TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'blocked', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL DEFAULT 0,
      question_type TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false', 'text')),
      question_text TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 1 CHECK (points >= 1 AND points <= 100),
      correct_text_answer TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS answer_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_text TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS test_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'timed_out')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT DEFAULT NULL,
      expires_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      is_terminated INTEGER NOT NULL DEFAULT 0,
      terminated_reason TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS student_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option_ids TEXT NOT NULL DEFAULT '[]',
      text_answer TEXT NOT NULL DEFAULT '',
      is_flagged INTEGER NOT NULL DEFAULT 0 CHECK (is_flagged IN (0, 1)),
      is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
      earned_points INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL UNIQUE REFERENCES test_attempts(id) ON DELETE CASCADE,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      total_questions INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      earned_points INTEGER NOT NULL DEFAULT 0,
      max_points INTEGER NOT NULL DEFAULT 0,
      percentage REAL NOT NULL DEFAULT 0,
      grade TEXT NOT NULL DEFAULT '2',
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      is_terminated INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS violation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('tab_hidden', 'window_blur', 'tab_returned')),
      details TEXT DEFAULT '',
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_by_teacher INTEGER NOT NULL DEFAULT 0 CHECK (reviewed_by_teacher IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_role TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe schema migrations for existing SQLite databases
  const attemptCols = (db.prepare('PRAGMA table_info(test_attempts)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!attemptCols.includes('is_terminated')) {
    db.exec('ALTER TABLE test_attempts ADD COLUMN is_terminated INTEGER NOT NULL DEFAULT 0;');
  }
  if (!attemptCols.includes('terminated_reason')) {
    db.exec("ALTER TABLE test_attempts ADD COLUMN terminated_reason TEXT DEFAULT '';");
  }

  const resultCols = (db.prepare('PRAGMA table_info(test_results)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!resultCols.includes('is_terminated')) {
    db.exec('ALTER TABLE test_results ADD COLUMN is_terminated INTEGER NOT NULL DEFAULT 0;');
  }

  // Seed structural reference data only (classes 5-A..11-D, subjects, school name) - NO fake users/tests/results
  const classCount = db.prepare('SELECT COUNT(*) as cnt FROM classes').get() as { cnt: number };
  if (classCount.cnt === 0) {
    const insertClass = db.prepare(
      'INSERT INTO classes (name, grade_level, section, is_active) VALUES (?, ?, ?, 1)'
    );
    const sections = ['A', 'B', 'D'];
    for (let grade = 5; grade <= 11; grade++) {
      for (const sec of sections) {
        insertClass.run(`${grade}-${sec}`, grade, sec);
      }
    }
  }

  const subjectCount = db.prepare('SELECT COUNT(*) as cnt FROM subjects').get() as { cnt: number };
  if (subjectCount.cnt === 0) {
    const defaultSubjects = [
      ['Matematika', 'Algebra va geometriya fanlari'],
      ['Fizika', 'Mexanika, elektr va optika asoslari'],
      ['Kimyo', 'Anorganik va organik kimyo'],
      ['Biologiya', 'Botanika, zoologiya va anatomiya'],
      ['Informatika', 'Algoritmlash va axborot texnologiyalari'],
      ['Ona tili va adabiyot', 'Grammatika, nutq madaniyati va adabiyot'],
      ['Ingliz tili', 'English grammar, reading and vocabulary'],
      ['Tarix', 'O‘zbekiston va jahon tarixi'],
      ['Geografiya', 'Tabiiy va iqtisodiy geografiya'],
    ];
    const insertSubject = db.prepare(
      'INSERT INTO subjects (name, description, is_active) VALUES (?, ?, 1)'
    );
    for (const [name, desc] of defaultSubjects) {
      insertSubject.run(name, desc);
    }
  }

  const schoolNameRow = db.prepare("SELECT value FROM system_settings WHERE key = 'school_name'").get() as { value: string } | undefined;
  if (!schoolNameRow) {
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('school_name', ?)").run(
      'SCHOOL TEST SYSTEM Maktabi'
    );
  }
}

export function logActivity(
  actorRole: string,
  actorName: string,
  action: string,
  targetType = '',
  targetId = '',
  details = ''
): void {
  try {
    db.prepare(
      'INSERT INTO activity_logs (actor_role, actor_name, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(actorRole, actorName, action, targetType, String(targetId), details);
  } catch (err) {
    console.error('Activity log error:', err);
  }
}
