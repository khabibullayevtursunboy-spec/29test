
import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  GraduationCap,
  Layers,
  Lock,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import type { AdminUser, SchoolClass, SubjectItem, TeacherUser } from '../types';

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Tasdiqlash',
  cancelLabel = 'Bekor qilish',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="w-full max-w-md glass-surface-strong rounded-[1.75rem] p-6 sm:p-7 border border-white/90 shadow-[0_35px_100px_-35px_rgba(10,25,65,.5)]"
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                  danger
                    ? 'bg-rose-500/15 border-rose-200/80 text-rose-600'
                    : 'bg-sky-500/15 border-sky-200/80 text-sky-700'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{message}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white/70 hover:bg-white border border-slate-200/80 rounded-xl transition-all whitespace-nowrap"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onConfirm}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-xl shadow-sm transition-all whitespace-nowrap disabled:opacity-60 ${
                  danger
                    ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600'
                    : 'bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900'
                }`}
              >
                {loading ? 'Bajarilmoqda...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function RoleChoiceModal({
  open,
  onClose,
  onSelectAdmin,
  onSelectTeacher,
}: {
  open: boolean;
  onClose: () => void;
  onSelectAdmin: () => void;
  onSelectTeacher: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-full max-w-lg glass-surface-strong rounded-[1.9rem] overflow-hidden border border-white/90 shadow-[0_35px_100px_-35px_rgba(10,25,65,.5)]"
          >
            <div className="relative px-6 py-6 sm:px-7 bg-gradient-to-br from-[#101d42] via-[#1d3474] to-[#2858b8] text-white flex items-center justify-between overflow-hidden before:absolute before:-right-12 before:-top-24 before:w-64 before:h-64 before:rounded-full before:border before:border-white/10 before:shadow-[0_0_70px_rgba(115,170,255,.2)]">
              <div>
                <h3 className="text-xl font-bold tracking-tight">Xush kelibsiz!</h3>
                <p className="text-xs text-sky-200/90 mt-0.5">
                  Qaysi panelga kirishni tanlang?
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <motion.button
                type="button"
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  onSelectTeacher();
                }}
                className="group text-left p-5 sm:p-6 rounded-[1.4rem] bg-white/75 hover:bg-white border border-white/90 hover:border-blue-200 shadow-[0_12px_32px_-22px_rgba(20,40,90,.35)] hover:shadow-[0_22px_45px_-22px_rgba(35,70,150,.32)] transition-all flex flex-col justify-between gap-5"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-200/80 text-sky-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 flex items-center justify-between">
                    <span>O‘qituvchi paneli</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all" />
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Testlar yaratish, o‘quvchilar natijalari va nazorat jurnali
                  </p>
                </div>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  onSelectAdmin();
                }}
                className="group text-left p-5 sm:p-6 rounded-[1.4rem] bg-white/75 hover:bg-white border border-white/90 hover:border-indigo-200 shadow-[0_12px_32px_-22px_rgba(20,40,90,.35)] hover:shadow-[0_22px_45px_-22px_rgba(35,70,150,.32)] transition-all flex flex-col justify-between gap-5"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-200/80 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 flex items-center justify-between">
                    <span>Administrator paneli</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Sinflar, fanlar, o‘qituvchilar va tizim boshqaruvi
                  </p>
                </div>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TeacherLoginModal({
  open,
  classes,
  subjects,
  onClose,
  onSuccess,
}: {
  open: boolean;
  classes: SchoolClass[];
  subjects: SubjectItem[];
  onClose: () => void;
  onSuccess: (user: TeacherUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;

    setError('');
    setNotice('');

    if (!classId && classes[0]) {
      setClassId(String(classes[0].id));
    }

    if (!subjectId && subjects[0]) {
      setSubjectId(String(subjects[0].id));
    }
  }, [open, classes, subjects, classId, subjectId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const cleanUsername = username.trim().toLowerCase();

    if (!cleanUsername || cleanUsername.length < 3) {
      setError('Login kamida 3 ta belgidan iborat bo‘lsin.');
      return;
    }

    if (password.length < 8) {
      setError('Parol kamida 8 ta belgidan iborat bo‘lishi kerak.');
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Ism va familiyangizni kiriting.');
        return;
      }

      if (!classId || !subjectId) {
        setError('Sinf va fanni tanlang.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Parollar mos kelmadi.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        const data = await apiRequest<{
          registered: boolean;
          message: string;
        }>('/api/auth/teacher/register', {
          method: 'POST',
          body: JSON.stringify({
            fullName: fullName.trim(),
            username: cleanUsername,
            password,
            classId: Number(classId),
            subjectId: Number(subjectId),
          }),
        });

        setNotice(
          data.message ||
            'Ro‘yxatdan o‘tildi. Administrator tasdiqlashini kuting.'
        );

        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setFullName('');
      } else {
        const data = await apiRequest<{
          token: string;
          user: TeacherUser;
        }>('/api/auth/teacher/login', {
          method: 'POST',
          body: JSON.stringify({
            username: cleanUsername,
            password,
          }),
        });

        setAuthToken(data.token);
        onSuccess(data.user);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Amalni bajarishda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="w-full max-w-md glass-surface-strong rounded-[1.9rem] overflow-hidden max-h-[92vh] overflow-y-auto border border-white/90 shadow-[0_35px_100px_-35px_rgba(10,25,65,.5)]"
          >
            <div className="relative px-6 py-6 sm:px-7 bg-gradient-to-br from-[#101d42] via-[#1d3474] to-[#2858b8] text-white flex items-center justify-between overflow-hidden before:absolute before:-right-12 before:-top-24 before:w-64 before:h-64 before:rounded-full before:border before:border-white/10 before:shadow-[0_0_70px_rgba(115,170,255,.2)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-sky-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">O‘qituvchi paneli</h3>
                  <p className="text-xs text-slate-300">
                    Shaxsiy kabinetingizga kiring
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100/80 border border-slate-200/70 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setNotice('');
                  }}
                  className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    mode === 'login'
                      ? 'bg-white text-[#1b3478] shadow-[0_5px_16px_-7px_rgba(25,55,125,.35)] ring-1 ring-white'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Kirish
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setNotice('');
                  }}
                  className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    mode === 'register'
                      ? 'bg-white text-[#1b3478] shadow-[0_5px_16px_-7px_rgba(25,55,125,.35)] ring-1 ring-white'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ro‘yxatdan o‘tish
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {notice && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                  {notice}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Ism va familiya
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Masalan: Azizbek Karimov"
                          className="w-full pl-10 pr-3.5 py-3 text-sm bg-slate-50/80 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Sinf
                      </label>
                      <div className="relative">
                        <Layers className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <select
                          required
                          value={classId}
                          onChange={(e) => setClassId(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-3 text-sm bg-slate-50/80 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        >
                          <option value="">Sinfni tanlang</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Fan
                      </label>
                      <div className="relative">
                        <BookOpen className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <select
                          required
                          value={subjectId}
                          onChange={(e) => setSubjectId(e.target.value)}
                          className="w-full pl-10 pr-3.5 py-3 text-sm bg-slate-50/80 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        >
                          <option value="">Fanni tanlang</option>
                          {subjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Login
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Loginni kiriting"
                      className="w-full pl-10 pr-3.5 py-3 text-sm bg-slate-50/80 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Parol
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete={
                        mode === 'login' ? 'current-password' : 'new-password'
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Kamida 8 ta belgi"
                      className="w-full pl-10 pr-10 py-3 text-sm bg-slate-50/80 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label="Parolni ko‘rsatish"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Parolni tasdiqlang
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Parolni qayta kiriting"
                      className="w-full px-3.5 py-3 text-sm bg-slate-50/80 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                )}

                {mode === 'register' && (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Ro‘yxatdan o‘tganingizdan so‘ng administrator
                    tasdiqlashini kutishingiz kerak bo‘ladi.
                  </p>
                )}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#172d67] via-[#254cae] to-[#3976e8] hover:brightness-110 rounded-xl shadow-[0_12px_24px_-10px_rgba(39,80,180,.55)] transition-all disabled:opacity-60"
                  >
                    {loading
                      ? 'Kutilmoqda...'
                      : mode === 'login'
                        ? 'Panelga kirish'
                        : 'Ro‘yxatdan o‘tish'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AdminLoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: AdminUser) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setPassword('');
    setConfirmPassword('');
    setConfigured(null);
    apiRequest<{ configured: boolean }>('/api/auth/admin/status')
      .then((res) => setConfigured(res.configured))
      .catch(() => setConfigured(true));
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (configured === false) {
      if (password.length < 6) {
        setError('Parol kamida 6 ta belgidan iborat bo‘lishi kerak.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Parollar mos kelmadi.');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint =
        configured === false
          ? '/api/auth/admin/claim'
          : '/api/auth/admin/login';

      const data = await apiRequest<{ token: string; user: AdminUser }>(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify({ password }),
        }
      );

      setAuthToken(data.token);
      onSuccess(data.user);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Kirish amalga oshmadi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="w-full max-w-md glass-surface-strong rounded-[1.9rem] overflow-hidden border border-white/90 shadow-[0_35px_100px_-35px_rgba(10,25,65,.5)]"
          >
            <div className="relative px-6 py-6 sm:px-7 bg-gradient-to-br from-[#101d42] via-[#1d3474] to-[#2858b8] text-white flex items-center justify-between overflow-hidden before:absolute before:-right-12 before:-top-24 before:w-64 before:h-64 before:rounded-full before:border before:border-white/10 before:shadow-[0_0_70px_rgba(115,170,255,.2)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">
                    {configured === false
                      ? 'Administrator parolini o‘rnatish'
                      : 'Administrator kirishi'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {configured === false
                      ? 'Birinchi marta kirish uchun maxfiy parol yarating'
                      : 'Tizim boshqaruvi uchun maxfiy parol'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {configured === null ? (
              <div className="p-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    {configured === false
                      ? 'Yangi administrator paroli'
                      : 'Administrator paroli'}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Kamida 6 ta belgi"
                      className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label="Parolni ko‘rsatish"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {configured === false && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Parolni tasdiqlang
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Parolni qayta kiriting"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                    />
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#172d67] via-[#254cae] to-[#3976e8] hover:brightness-110 rounded-xl shadow-[0_12px_24px_-10px_rgba(39,80,180,.55)] transition-all disabled:opacity-60"
                  >
                    {loading
                      ? 'Saqlanmoqda...'
                      : configured === false
                        ? 'Saqlash va kirish'
                        : 'Kirish'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
