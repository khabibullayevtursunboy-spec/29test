import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GraduationCap } from 'lucide-react';
import { apiRequest, setAuthToken } from './lib/api';
import type { AdminUser, SchoolClass, SessionUser, StudentUser, SubjectItem, TeacherUser } from './types';
import { AdminLoginModal, RoleChoiceModal, TeacherLoginModal } from './components/Modals';
import { StudentPortal } from './components/StudentPortal';
import { TeacherPanel } from './components/TeacherPanel';
import { AdminPanel } from './components/AdminPanel';

export default function App() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [schoolName, setSchoolName] = useState('SCHOOL TEST SYSTEM');
  const [bootLoading, setBootLoading] = useState(true);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [roleChoiceOpen, setRoleChoiceOpen] = useState(false);
  const [teacherLoginOpen, setTeacherLoginOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

  // Secret 4-click counter on the final letter "y" of "Made in Tursunboy"
  const secretYClicksRef = useRef<{ count: number; lastTs: number }>({ count: 0, lastTs: 0 });

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await apiRequest<{
        classes: SchoolClass[];
        subjects: SubjectItem[];
        schoolName: string;
      }>('/api/public/bootstrap');
      setClasses(data.classes);
      setSubjects(data.subjects);
      setSchoolName(data.schoolName);
    } catch (err) {
      console.error('Bootstrap error:', err);
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const handleSecretYClick = () => {
    const now = Date.now();
    if (now - secretYClicksRef.current.lastTs > 2800) {
      secretYClicksRef.current.count = 1;
    } else {
      secretYClicksRef.current.count += 1;
    }
    secretYClicksRef.current.lastTs = now;

    if (secretYClicksRef.current.count >= 4) {
      secretYClicksRef.current.count = 0;
      setRoleChoiceOpen(true);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setSessionUser(null);
  };

  return (
    <div className="relative min-h-screen flex flex-col text-slate-900 overflow-x-hidden">
      {/* Ambient Atmospheric Canvas for Deep Frosted Glassmorphism */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full bg-sky-300/35 blur-3xl animate-float-slow" />
        <div
          className="absolute top-1/4 -right-28 w-[520px] h-[520px] rounded-full bg-indigo-300/30 blur-3xl animate-float-slow"
          style={{ animationDelay: '-5s' }}
        />
        <div
          className="absolute -bottom-32 left-1/3 w-[460px] h-[460px] rounded-full bg-violet-300/25 blur-3xl animate-float-slow"
          style={{ animationDelay: '-9s' }}
        />
      </div>

      {/* Top Glass Header */}
      <header className="sticky top-0 z-40 h-16 bg-white/65 backdrop-blur-2xl border-b border-white/80 shadow-[0_6px_28px_-14px_rgba(15,23,42,0.14)] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <motion.div
            whileHover={{ rotate: -6, scale: 1.04 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-900 text-white flex items-center justify-center shadow-md"
          >
            <GraduationCap className="w-4 h-4 text-sky-300" />
          </motion.div>
          <span className="font-display font-bold text-base tracking-tight text-slate-900 whitespace-nowrap">
            SCHOOL TEST SYSTEM
          </span>
        </div>

        <div className="hidden md:flex items-center text-xs font-medium text-slate-600 whitespace-nowrap">
          {sessionUser?.role === 'admin'
            ? 'Administrator boshqaruv paneli'
            : sessionUser?.role === 'teacher'
            ? 'O‘qituvchi ish maydoni'
            : sessionUser?.role === 'student'
            ? `${sessionUser.className} · ${sessionUser.fullName}`
            : schoolName}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {sessionUser ? (
            <span className="text-xs font-semibold text-slate-700 px-3 py-1.5 rounded-xl bg-white/70 border border-white/90 whitespace-nowrap shadow-xs">
              {sessionUser.role === 'admin'
                ? 'Administrator'
                : sessionUser.role === 'teacher'
                ? 'O‘qituvchi'
                : 'O‘quvchi'}
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap hidden sm:inline">
              Onlayn test platformasi
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1">
        {bootLoading ? (
          <div className="max-w-6xl mx-auto px-4 py-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-[520px] rounded-3xl bg-white/40 backdrop-blur-xl border border-white/60 animate-pulse" />
              <div className="h-[520px] rounded-3xl glass-surface p-8 space-y-4 animate-pulse">
                <div className="h-7 w-48 bg-slate-200/80 rounded-lg" />
                <div className="h-4 w-72 bg-slate-100/90 rounded-lg" />
                <div className="h-11 bg-slate-100/90 rounded-xl mt-6" />
                <div className="h-11 bg-slate-100/90 rounded-xl" />
                <div className="h-11 bg-slate-100/90 rounded-xl" />
              </div>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {sessionUser?.role === 'teacher' ? (
              <motion.div
                key="teacher-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <TeacherPanel
                  user={sessionUser}
                  onLogout={handleLogout}
                  onProfileUpdate={(patch) =>
                    setSessionUser((prev) =>
                      prev && prev.role === 'teacher' ? { ...prev, ...patch } : prev
                    )
                  }
                />
              </motion.div>
            ) : sessionUser?.role === 'admin' ? (
              <motion.div
                key="admin-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <AdminPanel onLogout={handleLogout} onBootstrapRefresh={loadBootstrap} />
              </motion.div>
            ) : (
              <motion.div
                key="student-portal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <StudentPortal
                  classes={classes}
                  schoolName={schoolName}
                  student={sessionUser?.role === 'student' ? sessionUser : null}
                  onStudentLogin={(st: StudentUser) => setSessionUser(st)}
                  onStudentLogout={handleLogout}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Discreet footer where only the final letter "y" triggers the 4-click role menu */}
      {!sessionUser && (
        <footer className="py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <span className="text-[11px] text-slate-400/90 select-none">
            Made in Tursunbo
            <span onClick={handleSecretYClick} className="cursor-default select-none">
              y
            </span>
          </span>
          <span className="text-[11px] text-slate-400/90 select-none">SCHOOL TEST SYSTEM</span>
        </footer>
      )}

      <RoleChoiceModal
        open={roleChoiceOpen}
        onClose={() => setRoleChoiceOpen(false)}
        onSelectTeacher={() => setTeacherLoginOpen(true)}
        onSelectAdmin={() => setAdminLoginOpen(true)}
      />

      <TeacherLoginModal
        open={teacherLoginOpen}
        classes={classes}
        subjects={subjects}
        onClose={() => setTeacherLoginOpen(false)}
        onSuccess={(user: TeacherUser) => setSessionUser(user)}
      />

      <AdminLoginModal
        open={adminLoginOpen}
        onClose={() => setAdminLoginOpen(false)}
        onSuccess={(user: AdminUser) => setSessionUser(user)}
      />
    </div>
  );
}
