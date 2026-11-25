import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  HelpCircle,
  LogOut,
  Play,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import type {
  SchoolClass,
  StudentAnswerDraft,
  StudentQuestion,
  StudentTestCard,
  StudentUser,
} from '../types';
import { ConfirmModal } from './Modals';

interface ActiveTestSession {
  attemptId: number;
  expiresAt: string;
  test: {
    id: number;
    title: string;
    description: string;
    subjectName: string;
    teacherName: string;
    durationMinutes: number;
    questionCount: number;
  };
  questions: StudentQuestion[];
  answers: Record<number, StudentAnswerDraft>;
}

export function StudentPortal({
  classes,
  schoolName,
  student,
  onStudentLogin,
  onStudentLogout,
}: {
  classes: SchoolClass[];
  schoolName: string;
  student: StudentUser | null;
  onStudentLogin: (s: StudentUser) => void;
  onStudentLogout: () => void;
}) {
  // Login state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [classId, setClassId] = useState<string>('');
  const [studentCode, setStudentCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  // Tests list state
  const [tests, setTests] = useState<StudentTestCard[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState('');
  const autoEnteredRef = useRef(false);

  // Countdown before test start
  const [countdownTest, setCountdownTest] = useState<StudentTestCard | null>(null);
  const [countdownVal, setCountdownVal] = useState(3);

  // Active Test Runner state
  const [session, setSession] = useState<ActiveTestSession | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const [submittingState, setSubmittingState] = useState<'idle' | 'saving' | 'done' | 'terminated'>('idle');
  const [terminatedReason, setTerminatedReason] = useState('');

  const testStartedAtRef = useRef(0);
  const terminatedTriggeredRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);

  const fetchTests = useCallback(async (allowAutoEnter: boolean) => {
    setTestsLoading(true);
    setTestsError('');
    try {
      const res = await apiRequest<{ tests: StudentTestCard[] }>('/api/student/tests');
      setTests(res.tests);
      if (allowAutoEnter && !autoEnteredRef.current) {
        const eligible = res.tests.filter((t) => t.canStart);
        if (res.tests.length === 1 && eligible.length === 1) {
          autoEnteredRef.current = true;
          setCountdownTest(eligible[0]);
          setCountdownVal(3);
        }
      }
    } catch (err: any) {
      setTestsError(err?.message || 'Testlarni yuklashda xatolik yuz berdi.');
    } finally {
      setTestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (student) {
      autoEnteredRef.current = false;
      fetchTests(true);
    } else {
      setTests([]);
      setSession(null);
      setSubmittingState('idle');
      setTerminatedReason('');
    }
  }, [student, fetchTests]);

  const startTestNow = useCallback(async (testId: number) => {
    setTestsError('');
    try {
      const res = await apiRequest<{
        attemptId: number;
        expiresAt: string;
        serverNow: string;
        test: ActiveTestSession['test'];
        questions: StudentQuestion[];
        savedAnswers: Record<number, StudentAnswerDraft>;
      }>(`/api/student/tests/${testId}/start`, {
        method: 'POST',
      });

      const serverNowMs = Date.parse(res.serverNow);
      const expMs = Date.parse(res.expiresAt);
      const initialSeconds = Math.max(0, Math.floor((expMs - serverNowMs) / 1000));

      testStartedAtRef.current = Date.now();
      terminatedTriggeredRef.current = false;
      autoSubmitTriggeredRef.current = false;

      setSession({
        attemptId: res.attemptId,
        expiresAt: res.expiresAt,
        test: res.test,
        questions: res.questions,
        answers: res.savedAnswers || {},
      });
      setCurrentIdx(0);
      setSecondsLeft(initialSeconds);
      setTerminatedReason('');
      setSubmittingState('idle');
    } catch (err: any) {
      setCountdownTest(null);
      setTestsError(err?.message || 'Testni boshlashning iloji bo‘lmadi.');
    }
  }, []);

  // Start 3-2-1 countdown animation effect
  useEffect(() => {
    if (!countdownTest) return;
    if (countdownVal <= 0) {
      const targetId = countdownTest.id;
      setCountdownTest(null);
      startTestNow(targetId);
      return;
    }
    const timer = setTimeout(() => {
      setCountdownVal((v) => v - 1);
    }, 650);
    return () => clearTimeout(timer);
  }, [countdownTest, countdownVal, startTestNow]);

  const submitAttempt = useCallback(
    async (timedOut = false) => {
      if (!session || submittingState !== 'idle') return;
      setConfirmFinishOpen(false);
      setSubmittingState('saving');
      try {
        await apiRequest<{ success: boolean; message: string }>(
          `/api/student/attempts/${session.attemptId}/submit`,
          {
            method: 'POST',
            body: JSON.stringify({ timedOut }),
          }
        );
        setTimeout(() => {
          setSubmittingState('done');
        }, 700);
      } catch (err: any) {
        setSubmittingState('idle');
        setTestsError(err?.message || 'Testni topshirishda xatolik yuz berdi.');
      }
    },
    [session, submittingState]
  );

  // Live timer countdown
  useEffect(() => {
    if (!session || submittingState !== 'idle') return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!autoSubmitTriggeredRef.current) {
            autoSubmitTriggeredRef.current = true;
            submitAttempt(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [session, submittingState, submitAttempt]);

  // Strict Browser Visibility & Window Focus Monitor -> Immediate Test Termination
  useEffect(() => {
    if (!session || submittingState !== 'idle') return;
    const attemptId = session.attemptId;

    const kickOutForViolation = (eventType: 'tab_hidden' | 'window_blur', details: string) => {
      if (terminatedTriggeredRef.current) return;
      // 1200ms initial mount grace period so first focus transitions don't misfire
      if (Date.now() - testStartedAtRef.current < 1200) return;

      terminatedTriggeredRef.current = true;
      setConfirmFinishOpen(false);
      setTerminatedReason(details);
      setSubmittingState('terminated');

      apiRequest(`/api/student/attempts/${attemptId}/violation`, {
        method: 'POST',
        body: JSON.stringify({ eventType, details }),
      }).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        kickOutForViolation('tab_hidden', 'Boshqa tabga o‘tilgani yoki test sahifasi yashirilgani sababli test yakunlandi');
      }
    };

    const handleBlur = () => {
      kickOutForViolation('window_blur', 'Boshqa brauzer oynasi yoki ilovaga o‘tilgani sababli test yakunlandi');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [session, submittingState]);

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!classId) {
      setLoginError('Iltimos, sinfingizni tanlang.');
      return;
    }
    setLoginLoading(true);
    try {
      const data = await apiRequest<{ token: string; user: StudentUser }>('/api/auth/student/login', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          classId: Number(classId),
          studentCode: studentCode.trim(),
        }),
      });
      setAuthToken(data.token);
      onStudentLogin(data.user);
    } catch (err: any) {
      setLoginError(err?.message || 'Kirishda xatolik yuz berdi.');
    } finally {
      setLoginLoading(false);
    }
  };

  const updateAnswer = async (questionId: number, patch: Partial<StudentAnswerDraft>) => {
    if (!session || submittingState !== 'idle') return;
    const prev = session.answers[questionId] || {
      selectedOptionIds: [],
      textAnswer: '',
      isFlagged: false,
    };
    const next: StudentAnswerDraft = { ...prev, ...patch };
    setSession((s) =>
      s
        ? {
            ...s,
            answers: {
              ...s.answers,
              [questionId]: next,
            },
          }
        : null
    );

    try {
      await apiRequest(`/api/student/attempts/${session.attemptId}/answer`, {
        method: 'PUT',
        body: JSON.stringify({
          questionId,
          selectedOptionIds: next.selectedOptionIds,
          textAnswer: next.textAnswer,
          isFlagged: next.isFlagged,
        }),
      });
    } catch (err: any) {
      if (err?.data?.timedOut) {
        submitAttempt(true);
      }
    }
  };

  const isQuestionAnswered = (q: StudentQuestion, draft?: StudentAnswerDraft) => {
    if (!draft) return false;
    if (q.questionType === 'single_choice' || q.questionType === 'multiple_choice') {
      return draft.selectedOptionIds.length > 0;
    }
    return draft.textAnswer.trim().length > 0;
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // =============================================
  // VIEW 1: STUDENT LOGIN SPLIT VIEW
  // =============================================
  if (!student) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Showcase Column */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 relative rounded-3xl overflow-hidden bg-slate-900 border border-white/20 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.4)] min-h-[340px] lg:min-h-[540px] flex flex-col justify-between p-8 text-white"
          >
            {!imgFailed ? (
              <img
                src="/src/assets/images/academic_geometry_panel_1795581234246.jpg"
                alt="Akademik test muhiti"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover opacity-85 scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-slate-950/30" />

            <div className="relative z-10 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-sky-300 px-3 py-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/15">
                {schoolName}
              </span>
              <span className="text-xs text-slate-200 tabular-nums px-3 py-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/15">
                5–11-sinflar
              </span>
            </div>

            <div className="relative z-10 space-y-5">
              <div className="max-w-md space-y-3">
                <h1
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight"
                  style={{ textWrap: 'balance' }}
                >
                  Bilimingizni aniq va xolis onlayn test tizimida sinab ko‘ring
                </h1>
                <p className="text-sm text-slate-200/90 leading-relaxed">
                  O‘z sinfingizga biriktirilgan faol fan testlariga kiring. Barcha javoblar real vaqtda saqlanadi.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-inner">
                <div>
                  <p className="text-xs text-sky-200">Saqlash</p>
                  <p className="text-sm font-semibold text-white mt-0.5">Avtomatik</p>
                </div>
                <div className="border-l border-white/15 pl-3">
                  <p className="text-xs text-sky-200">Nazorat</p>
                  <p className="text-sm font-semibold text-white mt-0.5">Qat’iy rejim</p>
                </div>
                <div className="border-l border-white/15 pl-3">
                  <p className="text-xs text-sky-200">Baholash</p>
                  <p className="text-sm font-semibold text-white mt-0.5">Xolis tizim</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Frosted Glass Login Card */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            className="lg:col-span-6 glass-surface-strong rounded-3xl p-6 sm:p-10 flex flex-col justify-center"
          >
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">O‘quvchi kirishi</h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Testni boshlash uchun ism, familiya va sinfingizni kiriting.
              </p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {loginError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-2xl bg-rose-50/90 backdrop-blur-md border border-rose-200 text-sm text-rose-700"
                >
                  {loginError}
                </motion.div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Ismi</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Masalan: Jasur"
                    className="w-full px-3.5 py-2.5 text-sm bg-white/75 border border-white/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Familiyasi</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Masalan: Alimov"
                    className="w-full px-3.5 py-2.5 text-sm bg-white/75 border border-white/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Sinfi</label>
                <select
                  required
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white/75 border border-white/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-xs"
                >
                  <option value="">Sinfingizni tanlang</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700">Individual o‘quvchi kodi</label>
                  <span className="text-xs text-slate-400">Ixtiyoriy (avval berilgan bo‘lsa)</span>
                </div>
                <input
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                  placeholder="Masalan: STS-A7K9P2"
                  className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-white/75 border border-white/90 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-xs"
                />
              </div>

              <div className="pt-3">
                <motion.button
                  whileHover={{ y: -1.5, scale: 1.005 }}
                  whileTap={{ scale: 0.985 }}
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-sky-900 hover:from-slate-800 hover:to-sky-800 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 transition-all disabled:opacity-60"
                >
                  {loginLoading ? (
                    <span>Tekshirilmoqda...</span>
                  ) : (
                    <>
                      <span>Kirish va testlarni ko‘rish</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>

        {/* Clean 3-column academic glass feature strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Clock,
              title: 'Aniq vaqt boshqaruvi',
              desc: 'Har bir test server vaqti bilan nazorat qilinadi va vaqt tugaganda avtomatik yuboriladi.',
            },
            {
              icon: BookOpen,
              title: '4 xil savol formati',
              desc: 'Bitta javobli, ko‘p javobli, Ha/Yo‘q hamda matnli savollar bilan qulay ishlash.',
            },
            {
              icon: UserCheck,
              title: 'Shaxsiy identifikatsiya',
              desc: 'Har bir o‘quvchi uchun individual kod orqali xavfsiz kirish va urinishlar nazorati.',
            },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.06, duration: 0.3 }}
                whileHover={{ y: -3 }}
                className="glass-surface rounded-2xl p-5 flex items-start gap-3.5 transition-shadow hover:shadow-xl"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/15 to-indigo-500/15 border border-white/90 text-sky-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // =============================================
  // VIEW 2A: TERMINATED FOR SWITCHING WINDOW / TAB
  // =============================================
  if (session && submittingState === 'terminated') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          className="glass-surface-strong rounded-3xl border-rose-200/80 p-8 sm:p-10 text-center space-y-5"
        >
          <motion.div
            initial={{ scale: 0.4, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 18 }}
            className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/15 border border-rose-300/80 text-rose-600 flex items-center justify-center"
          >
            <ShieldAlert className="w-9 h-9" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold text-rose-700">Testdan chiqarildingiz!</h2>
            <p className="mt-2.5 text-sm text-slate-700 leading-relaxed">
              Test davomida boshqa oyna yoki brauzer tabiga o‘tganingiz uchun tizim sizni testdan avtomatik chiqardi va bu holat o‘qituvchi panelida qizil belgi bilan qayd etildi.
            </p>
            {terminatedReason && (
              <p className="mt-2 text-xs text-rose-600 font-medium">{terminatedReason}</p>
            )}
          </div>
          <div className="pt-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => {
                setSession(null);
                setSubmittingState('idle');
                setTerminatedReason('');
                fetchTests(false);
              }}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-white text-sm font-semibold shadow-md transition-all"
            >
              Bosh sahifaga qaytish
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  // =============================================
  // VIEW 2B: TEST COMPLETION / SAVING SCREEN
  // =============================================
  if (session && (submittingState === 'saving' || submittingState === 'done')) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          className="glass-surface-strong rounded-3xl p-8 sm:p-10 text-center"
        >
          {submittingState === 'saving' ? (
            <div className="space-y-5 py-6">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/15 border border-sky-200 flex items-center justify-center">
                <div className="w-7 h-7 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Javoblaringiz saqlanmoqda...</h2>
                <p className="mt-1.5 text-sm text-slate-500">Iltimos, sahifani yopmang.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-4">
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-200 text-emerald-600 flex items-center justify-center"
              >
                <CheckCircle2 className="w-9 h-9" />
              </motion.div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Test muvaffaqiyatli yakunlandi!</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Barcha javoblaringiz tizimga xavfsiz tarzda yuborildi. Natijalar o‘qituvchi tomonidan ko‘rib chiqiladi.
                </p>
              </div>
              <div className="pt-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setSession(null);
                    setSubmittingState('idle');
                    fetchTests(false);
                  }}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-white text-sm font-semibold shadow-md transition-all"
                >
                  Bosh sahifaga qaytish
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // =============================================
  // VIEW 3: TEST START COUNTDOWN OVERLAY
  // =============================================
  if (countdownTest) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          className="glass-surface-strong rounded-3xl p-10 text-center space-y-5"
        >
          <p className="text-xs font-semibold text-sky-700">{countdownTest.subjectName}</p>
          <h2 className="text-xl font-bold text-slate-900">{countdownTest.title}</h2>
          <div className="py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={countdownVal}
                initial={{ scale: 0.65, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 1.25, opacity: 0 }}
                transition={{ duration: 0.28 }}
                className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-900 text-white shadow-xl flex items-center justify-center text-3xl font-bold font-mono tabular-nums"
              >
                {countdownVal > 0 ? countdownVal : '1'}
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="text-sm text-slate-600">
            Test boshlanmoqda! Test vaqtida boshqa oyna yoki tabga o‘tmang.
          </p>
        </motion.div>
      </div>
    );
  }

  // =============================================
  // VIEW 4: ACTIVE TEST TAKING SCREEN
  // =============================================
  if (session) {
    const questions = session.questions;
    const currentQ = questions[currentIdx];
    const currentDraft = session.answers[currentQ.id] || {
      selectedOptionIds: [],
      textAnswer: '',
      isFlagged: false,
    };

    const answeredCount = questions.filter((q) => isQuestionAnswered(q, session.answers[q.id])).length;
    const flaggedCount = questions.filter((q) => session.answers[q.id]?.isFlagged).length;
    const unansweredCount = questions.length - answeredCount;
    const isUrgentTime = secondsLeft <= 120;

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Sticky Top Frosted Glass Timer Bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-3 z-30 mb-6 glass-surface-strong rounded-2xl overflow-hidden"
        >
          <div className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-sky-700">{session.test.subjectName}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  Savol {currentIdx + 1} / {questions.length}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">{session.test.title}</h2>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div
                className={`px-3.5 py-2 rounded-xl border flex items-center gap-2 font-mono text-sm font-semibold tabular-nums backdrop-blur-md ${
                  isUrgentTime
                    ? 'bg-rose-500/15 border-rose-300 text-rose-700 animate-pulse'
                    : 'bg-white/75 border-white text-slate-900'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{formatTimer(secondsLeft)}</span>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => setConfirmFinishOpen(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-white text-sm font-semibold shadow-sm transition-all whitespace-nowrap"
              >
                Testni yakunlash
              </motion.button>
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-200/60">
            <motion.div
              className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500"
              initial={false}
              animate={{ width: `${Math.round((answeredCount / Math.max(1, questions.length)) * 100)}%` }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </motion.div>

        {/* Strict Proctor Notice */}
        <div className="mb-5 px-4 py-2.5 rounded-2xl bg-sky-500/10 backdrop-blur-md border border-sky-200/80 text-xs text-sky-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-sky-700 shrink-0" />
          <span>
            Nazorat qoidasi: test davomida boshqa oyna yoki tabga o‘tsangiz, test avtomatik to‘xtatiladi va siz testdan chiqarilasiz.
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Question Workspace with smooth slide transitions */}
          <div className="lg:col-span-8 glass-surface-strong rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200/70">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-bold text-slate-900 tabular-nums">{currentIdx + 1}-savol</span>
                <span aria-hidden="true">·</span>
                <span>
                  {currentQ.questionType === 'single_choice'
                    ? 'Bitta to‘g‘ri javob'
                    : currentQ.questionType === 'multiple_choice'
                    ? 'Bir nechta to‘g‘ri javob'
                    : currentQ.questionType === 'true_false'
                    ? 'Ha yoki yo‘q'
                    : 'Matnli javob'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{currentQ.points} ball</span>
              </div>

              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => updateAnswer(currentQ.id, { isFlagged: !currentDraft.isFlagged })}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
                  currentDraft.isFlagged
                    ? 'bg-amber-50/90 border-amber-300 text-amber-800'
                    : 'bg-white/70 border-white/90 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{currentDraft.isFlagged ? 'Belgilangan' : 'Savolni belgilash'}</span>
              </motion.button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentQ.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="py-6"
              >
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900 leading-relaxed whitespace-pre-wrap">
                  {currentQ.questionText}
                </h3>

                <div className="mt-6 space-y-3">
                  {currentQ.questionType === 'single_choice' &&
                    currentQ.options.map((opt, idx) => {
                      const checked = currentDraft.selectedOptionIds.includes(opt.id);
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <motion.button
                          key={opt.id}
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.99 }}
                          type="button"
                          onClick={() => updateAnswer(currentQ.id, { selectedOptionIds: [opt.id] })}
                          className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-3.5 ${
                            checked
                              ? 'bg-gradient-to-r from-slate-900 to-indigo-950 border-slate-900 text-white shadow-md'
                              : 'bg-white/75 border-white/90 text-slate-800 hover:border-sky-300 hover:bg-white'
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                              checked ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="text-sm sm:text-base">{opt.optionText}</span>
                        </motion.button>
                      );
                    })}

                  {currentQ.questionType === 'multiple_choice' &&
                    currentQ.options.map((opt, idx) => {
                      const checked = currentDraft.selectedOptionIds.includes(opt.id);
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <motion.button
                          key={opt.id}
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.99 }}
                          type="button"
                          onClick={() => {
                            const nextIds = checked
                              ? currentDraft.selectedOptionIds.filter((id) => id !== opt.id)
                              : [...currentDraft.selectedOptionIds, opt.id];
                            updateAnswer(currentQ.id, { selectedOptionIds: nextIds });
                          }}
                          className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-3.5 ${
                            checked
                              ? 'bg-indigo-50/95 border-indigo-400 text-slate-900 shadow-sm'
                              : 'bg-white/75 border-white/90 text-slate-800 hover:border-indigo-300 hover:bg-white'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center border shrink-0 ${
                              checked
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-slate-300 text-slate-500'
                            }`}
                          >
                            {checked ? '✓' : letter}
                          </span>
                          <span className="text-sm sm:text-base">{opt.optionText}</span>
                        </motion.button>
                      );
                    })}

                  {currentQ.questionType === 'true_false' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { key: 'ha', label: 'Ha' },
                        { key: 'yoq', label: 'Yo‘q' },
                      ].map((choice) => {
                        const active = currentDraft.textAnswer === choice.key;
                        return (
                          <motion.button
                            key={choice.key}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => updateAnswer(currentQ.id, { textAnswer: choice.key })}
                            className={`p-5 rounded-2xl border text-center font-semibold transition-all ${
                              active
                                ? 'bg-gradient-to-r from-slate-900 to-indigo-950 border-slate-900 text-white shadow-md'
                                : 'bg-white/75 border-white/90 text-slate-800 hover:border-sky-300 hover:bg-white'
                            }`}
                          >
                            {choice.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}

                  {currentQ.questionType === 'text' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-2">
                        Javobingizni yozing
                      </label>
                      <input
                        type="text"
                        value={currentDraft.textAnswer}
                        onChange={(e) => updateAnswer(currentQ.id, { textAnswer: e.target.value })}
                        placeholder="Javob matnini kiriting..."
                        className="w-full px-4 py-3 text-base bg-white/80 border border-white/90 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="pt-5 border-t border-slate-200/70 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="px-4 py-2.5 rounded-xl bg-white/75 border border-white/90 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-40 flex items-center gap-1.5 transition-all whitespace-nowrap"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Oldingi savol</span>
              </button>

              {currentIdx < questions.length - 1 ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-white text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
                >
                  <span>Keyingi savol</span>
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setConfirmFinishOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-md transition-all whitespace-nowrap"
                >
                  Testni yakunlash
                </motion.button>
              )}
            </div>
          </div>

          {/* Question Navigator Sidebar */}
          <div className="lg:col-span-4 glass-surface-strong rounded-3xl p-6 space-y-5">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Savollar xaritasi</h4>
              <p className="text-xs text-slate-500 mt-1">
                Javob berilgan: <strong className="text-slate-900 tabular-nums">{answeredCount}</strong> · Javobsiz:{' '}
                <strong className="text-slate-900 tabular-nums">{unansweredCount}</strong> · Belgilangan:{' '}
                <strong className="text-amber-700 tabular-nums">{flaggedCount}</strong>
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const draft = session.answers[q.id];
                const answered = isQuestionAnswered(q, draft);
                const flagged = Boolean(draft?.isFlagged);
                const isCurrent = idx === currentIdx;

                let btnClass = 'bg-white/75 border-white text-slate-700 hover:border-slate-300';
                if (flagged) {
                  btnClass = 'bg-amber-50/90 border-amber-400 text-amber-900';
                } else if (answered) {
                  btnClass = 'bg-gradient-to-br from-slate-900 to-indigo-950 border-slate-900 text-white';
                }

                return (
                  <motion.button
                    key={q.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-10 rounded-xl border text-xs font-semibold tabular-nums transition-all ${btnClass} ${
                      isCurrent ? 'ring-2 ring-sky-500 ring-offset-2' : ''
                    }`}
                  >
                    {idx + 1}
                  </motion.button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200/70 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-slate-900 inline-block" />
                <span>Javob berilgan savol</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-400 inline-block" />
                <span>Belgilab qo‘yilgan savol</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-white border border-slate-300 inline-block" />
                <span>Javobsiz savol</span>
              </div>
            </div>
          </div>
        </div>

        <ConfirmModal
          open={confirmFinishOpen}
          title="Testni yakunlaysizmi?"
          message={`Siz ${questions.length} ta savoldan ${answeredCount} tasiga javob berdingiz.${
            unansweredCount > 0 ? ` Hali ${unansweredCount} ta javobsiz savol mavjud.` : ''
          } Yakunlangandan so‘ng javoblarni o‘zgartirib bo‘lmaydi.`}
          confirmLabel="Ha, yakunlash"
          cancelLabel="Testga qaytish"
          onConfirm={() => submitAttempt(false)}
          onCancel={() => setConfirmFinishOpen(false)}
        />
      </div>
    );
  }

  // =============================================
  // VIEW 5: STUDENT TESTS LIST VIEW
  // =============================================
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Student Profile Strip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-surface-strong rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white flex items-center justify-center shrink-0 shadow-md">
            <UserCheck className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{student.fullName}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span>Sinf: {student.className}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700">Kod: {student.studentCode}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onStudentLogout}
          className="px-4 py-2 rounded-xl bg-white/75 border border-white/90 text-sm font-medium text-slate-700 hover:bg-white flex items-center gap-2 transition-all whitespace-nowrap"
        >
          <LogOut className="w-4 h-4" />
          <span>Chiqish</span>
        </button>
      </motion.div>

      {testsError && (
        <div className="p-4 rounded-2xl bg-rose-50/90 backdrop-blur-md border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{testsError}</span>
        </div>
      )}

      {testsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-surface rounded-3xl p-6 space-y-4 animate-pulse">
              <div className="h-4 bg-slate-200/80 rounded w-1/3" />
              <div className="h-6 bg-slate-200/80 rounded w-3/4" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
              <div className="h-10 bg-slate-100 rounded-xl w-full mt-4" />
            </div>
          ))}
        </div>
      ) : tests.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-surface-strong rounded-3xl p-12 text-center space-y-3"
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white/80 border border-white text-slate-500 flex items-center justify-center shadow-xs">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">
            Hozircha sizning sinfingiz uchun faol test mavjud emas
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            O‘qituvchingiz testni faollashtirganda bu yerda avtomatik ko‘rinadi.
          </p>
          <button
            type="button"
            onClick={() => fetchTests(false)}
            className="mt-2 px-4 py-2 rounded-xl bg-white/80 border border-white text-sm font-medium text-slate-700 hover:bg-white transition-all"
          >
            Yangilash
          </button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {student.className} sinfi uchun testlar ({tests.length})
            </h3>
            <button
              type="button"
              onClick={() => fetchTests(false)}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900"
            >
              Ro‘yxatni yangilash
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tests.map((test, idx) => {
              const isCompleted = test.completedAttempts >= test.maxAttempts && !test.inProgressAttemptId;
              const statusLabel = test.inProgressAttemptId
                ? 'Davom etmoqda'
                : isCompleted
                ? 'Topshirilgan'
                : test.availability === 'upcoming'
                ? 'Rejalashtirilgan'
                : test.availability === 'expired'
                ? 'Muddati tugagan'
                : 'Faol';

              return (
                <motion.div
                  key={test.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.28 }}
                  whileHover={{ y: -4 }}
                  className="glass-surface-strong rounded-3xl p-6 flex flex-col justify-between gap-5 transition-shadow hover:shadow-xl"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-sky-700">{test.subjectName}</span>
                      <span>{statusLabel}</span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 leading-snug">{test.title}</h4>
                    {test.description && (
                      <p className="text-xs text-slate-500 line-clamp-2">{test.description}</p>
                    )}
                    <div className="pt-2 space-y-1 text-xs text-slate-600">
                      <div>O‘qituvchi: {test.teacherName}</div>
                      <div className="flex items-center gap-2 tabular-nums">
                        <span>{test.questionCount} ta savol</span>
                        <span aria-hidden="true">·</span>
                        <span>{test.durationMinutes} daqiqa</span>
                      </div>
                      <div className="tabular-nums text-slate-500">
                        Urinishlar: {test.completedAttempts} / {test.maxAttempts}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileTap={test.canStart ? { scale: 0.98 } : undefined}
                    type="button"
                    disabled={!test.canStart}
                    onClick={() => {
                      setCountdownTest(test);
                      setCountdownVal(3);
                    }}
                    className={`w-full py-2.5 px-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      test.canStart
                        ? 'bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-white shadow-sm'
                        : 'bg-slate-200/70 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {test.inProgressAttemptId ? (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Davom ettirish</span>
                      </>
                    ) : isCompleted ? (
                      <span>Topshirilgan</span>
                    ) : test.canStart ? (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Testni boshlash</span>
                      </>
                    ) : (
                      <>
                        <HelpCircle className="w-4 h-4" />
                        <span>{statusLabel}</span>
                      </>
                    )}
                  </motion.button>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
