import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Archive,
  Ban,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Edit3,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportResultsToExcel, exportResultsToWord, formatDateTimeUz, formatDurationUz } from '../lib/exportUtils';
import type { SchoolClass, SubjectItem, TestRecord, TestResultRow, ViolationLogRow } from '../types';
import { ClassBarChart } from './Charts';
import { ConfirmModal } from './Modals';

type AdminTab =
  | 'dashboard'
  | 'teachers'
  | 'tests'
  | 'results'
  | 'classes'
  | 'subjects'
  | 'students'
  | 'activity';

interface AdminTeacherRow {
  id: number;
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  isActive: boolean;
  isApproved: boolean;
  subjectNames: string[];
  assignedClasses: string[];
  bio: string;
  phone: string;
  testCount: number;
  createdAt: string;
}

interface AdminStudentRow {
  id: number;
  first_name: string;
  last_name: string;
  class_id: number;
  class_name: string;
  student_code: string;
  attempt_count: number;
  created_at: string;
}

interface ActivityLogRow {
  id: number;
  actor_role: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export function AdminPanel({
  onLogout,
  onBootstrapRefresh,
}: {
  onLogout: () => void;
  onBootstrapRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dashboard
  const [dash, setDash] = useState<{
    stats: {
      teachers: number;
      tests: number;
      activeTests: number;
      students: number;
      submissions: number;
      violations: number;
    };
    recentActivity: ActivityLogRow[];
    testsBySubject: Array<{ subject_name: string; test_count: number }>;
  } | null>(null);

  // Data collections
  const [teachers, setTeachers] = useState<AdminTeacherRow[]>([]);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [results, setResults] = useState<TestResultRow[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);
  const [violationLogs, setViolationLogs] = useState<ViolationLogRow[]>([]);
  const [schoolName, setSchoolName] = useState('SCHOOL TEST SYSTEM');
  const [envManagedPassword, setEnvManagedPassword] = useState(false);

  // Teacher modal
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<AdminTeacherRow | null>(null);
  const [tUsername, setTUsername] = useState('');
  const [tPassword, setTPassword] = useState('');
  const [tFirstName, setTFirstName] = useState('');
  const [tLastName, setTLastName] = useState('');
  const [tPhone, setTPhone] = useState('');
  const [tBio, setTBio] = useState('');
  const [tSubjects, setTSubjects] = useState<string[]>([]);
  const [tClasses, setTClasses] = useState<string[]>([]);
  const [tIsActive, setTIsActive] = useState(true);
  const [tIsApproved, setTIsApproved] = useState(false);
  const [tError, setTError] = useState('');

  // Class & Subject quick add
  const [newClassGrade, setNewClassGrade] = useState(5);
  const [newClassSection, setNewClassSection] = useState('');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjDesc, setNewSubjDesc] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Student code edit
  const [editingStudent, setEditingStudent] = useState<AdminStudentRow | null>(null);
  const [stCodeEdit, setStCodeEdit] = useState('');

  // Result filters
  const [resTeacherFilter, setResTeacherFilter] = useState('');
  const [resClassFilter, setResClassFilter] = useState('');
  const [resSubjectFilter, setResSubjectFilter] = useState('');

  // Settings
  const [settingsSchoolName, setSettingsSchoolName] = useState('');
  const [settingsNewPass, setSettingsNewPass] = useState('');

  // Confirmations
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadAllBase = useCallback(async () => {
    const [d, tr, cl, sb, stg] = await Promise.all([
      apiRequest<NonNullable<typeof dash>>('/api/admin/dashboard'),
      apiRequest<{ teachers: AdminTeacherRow[] }>('/api/admin/teachers'),
      apiRequest<{ classes: SchoolClass[] }>('/api/admin/classes'),
      apiRequest<{ subjects: SubjectItem[] }>('/api/admin/subjects'),
      apiRequest<{ schoolName: string; envManagedPassword: boolean }>('/api/admin/settings'),
    ]);
    setDash(d);
    setTeachers(tr.teachers);
    setClasses(cl.classes);
    setSubjects(sb.subjects);
    setSchoolName(stg.schoolName);
    setSettingsSchoolName(stg.schoolName);
    setEnvManagedPassword(stg.envManagedPassword);
  }, []);

  const loadTests = useCallback(async () => {
    const res = await apiRequest<{ tests: TestRecord[] }>('/api/admin/tests');
    setTests(res.tests);
  }, []);

  const loadResults = useCallback(async () => {
    const params = new URLSearchParams();
    if (resTeacherFilter) params.set('teacherId', resTeacherFilter);
    if (resClassFilter) params.set('classId', resClassFilter);
    if (resSubjectFilter) params.set('subjectId', resSubjectFilter);
    const q = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<{ results: TestResultRow[] }>(`/api/admin/results${q}`);
    setResults(res.results);
  }, [resTeacherFilter, resClassFilter, resSubjectFilter]);

  const loadStudents = useCallback(async () => {
    const res = await apiRequest<{ students: AdminStudentRow[] }>('/api/admin/students');
    setStudents(res.students);
  }, []);

  const loadActivity = useCallback(async () => {
    const res = await apiRequest<{ activityLogs: ActivityLogRow[]; violationLogs: ViolationLogRow[] }>(
      '/api/admin/activity'
    );
    setActivityLogs(res.activityLogs);
    setViolationLogs(res.violationLogs);
  }, []);

  useEffect(() => {
    loadAllBase();
  }, [loadAllBase]);

  useEffect(() => {
    setActionMsg(null);
    if (activeTab === 'dashboard' || activeTab === 'teachers' || activeTab === 'classes' || activeTab === 'subjects') {
      loadAllBase();
    }
    if (activeTab === 'tests') loadTests();
    if (activeTab === 'results') loadResults();
    if (activeTab === 'students') loadStudents();
    if (activeTab === 'activity') loadActivity();
  }, [activeTab, loadAllBase, loadTests, loadResults, loadStudents, loadActivity]);

  const openAddTeacher = () => {
    setEditingTeacher(null);
    setTUsername('');
    setTPassword('');
    setTFirstName('');
    setTLastName('');
    setTPhone('');
    setTBio('');
    setTSubjects([]);
    setTClasses([]);
    setTIsActive(true);
    setTIsApproved(true);
    setTError('');
    setTeacherModalOpen(true);
  };

  const openEditTeacher = (t: AdminTeacherRow) => {
    setEditingTeacher(t);
    setTUsername(t.username);
    setTPassword('');
    setTFirstName(t.firstName);
    setTLastName(t.lastName);
    setTPhone(t.phone || '');
    setTBio(t.bio || '');
    setTSubjects(t.subjectNames || []);
    setTClasses(t.assignedClasses || []);
    setTIsActive(t.isActive);
    setTIsApproved(t.isApproved ?? false);
    setTError('');
    setTeacherModalOpen(true);
  };

  const handleSaveTeacher = async (e: FormEvent) => {
    e.preventDefault();
    setTError('');

    if (tPassword && tPassword.length < 8) {
      setTError('Yangi parol kamida 8 ta belgidan iborat bo‘lsin.');
      return;
    }

    try {
      if (editingTeacher) {
        await apiRequest(`/api/admin/teachers/${editingTeacher.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            firstName: tFirstName.trim(),
            lastName: tLastName.trim(),
            newPassword: tPassword || undefined,
            phone: tPhone.trim(),
            bio: tBio.trim(),
            subjectNames: tSubjects,
            assignedClasses: tClasses,
            isActive: tIsActive,
            isApproved: tIsApproved,
          }),
        });
      } else {
        await apiRequest('/api/admin/teachers', {
          method: 'POST',
          body: JSON.stringify({
            username: tUsername.trim(),
            password: tPassword,
            fullName: `${tFirstName.trim()} ${tLastName.trim()}`.trim(),
            firstName: tFirstName.trim(),
            lastName: tLastName.trim(),
            phone: tPhone.trim(),
            bio: tBio.trim(),
            subjectNames: tSubjects,
            assignedClasses: tClasses,
            isActive: tIsActive,
            isApproved: true,
          }),
        });
      }
      setTeacherModalOpen(false);
      await loadAllBase();
      setActionMsg({ type: 'ok', text: editingTeacher ? 'O‘qituvchi yangilandi.' : 'Yangi o‘qituvchi qo‘shildi.' });
    } catch (err: any) {
      setTError(err?.message || 'Xatolik yuz berdi.');
    }
  };

  const handleAddClass = async (e: FormEvent) => {
    e.preventDefault();
    setActionMsg(null);
    try {
      await apiRequest('/api/admin/classes', {
        method: 'POST',
        body: JSON.stringify({
          gradeLevel: Number(newClassGrade),
          section: newClassSection.trim().toUpperCase(),
        }),
      });
      setNewClassSection('');
      await loadAllBase();
      onBootstrapRefresh();
      setActionMsg({ type: 'ok', text: 'Sinf qo‘shildi.' });
    } catch (err: any) {
      setActionMsg({ type: 'err', text: err?.message || 'Xatolik.' });
    }
  };

  const handleToggleClass = async (c: SchoolClass) => {
    await apiRequest(`/api/admin/classes/${c.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: c.name,
        gradeLevel: c.grade_level,
        section: c.section,
        isActive: c.is_active !== 1,
      }),
    });
    await loadAllBase();
    onBootstrapRefresh();
  };

  const handleAddSubject = async (e: FormEvent) => {
    e.preventDefault();
    setActionMsg(null);
    try {
      await apiRequest('/api/admin/subjects', {
        method: 'POST',
        body: JSON.stringify({ name: newSubjName.trim(), description: newSubjDesc.trim() }),
      });
      setNewSubjName('');
      setNewSubjDesc('');
      await loadAllBase();
      setActionMsg({ type: 'ok', text: 'Fan qo‘shildi.' });
    } catch (err: any) {
      setActionMsg({ type: 'err', text: err?.message || 'Xatolik.' });
    }
  };

  const handleToggleSubject = async (s: SubjectItem) => {
    await apiRequest(`/api/admin/subjects/${s.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: s.name,
        description: s.description,
        isActive: s.is_active !== 1,
      }),
    });
    await loadAllBase();
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setActionMsg(null);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          schoolName: settingsSchoolName.trim(),
          newPassword: settingsNewPass || undefined,
        }),
      });
      setSettingsNewPass('');
      await loadAllBase();
      onBootstrapRefresh();
      setActionMsg({ type: 'ok', text: 'Tizim sozlamalari saqlandi.' });
    } catch (err: any) {
      setActionMsg({ type: 'err', text: err?.message || 'Sozlamalarni saqlashda xatolik.' });
    }
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'teachers', label: 'O‘qituvchilar', icon: GraduationCap },
    { id: 'tests', label: 'Testlar nazorati', icon: ClipboardList },
    { id: 'results', label: 'Barcha natijalar', icon: BookOpen },
    { id: 'classes', label: 'Sinflar', icon: Layers },
    { id: 'subjects', label: 'Fanlar', icon: BookOpen },
    { id: 'students', label: 'O‘quvchilar', icon: Users },
    { id: 'activity', label: 'Tizim va sozlamalar', icon: Activity },
  ];

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col lg:flex-row">
      {/* Desktop Frosted Dark Glass Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col glass-dark text-slate-200 p-4 justify-between">
        <div className="space-y-6">
          <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-indigo-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Administrator</p>
              <p className="text-xs text-slate-400 truncate">{schoolName}</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2.5 transition-colors ${
                    active ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-rose-950/60 hover:text-rose-200 flex items-center gap-2.5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Chiqish</span>
        </button>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-sm font-medium flex items-center gap-2"
        >
          <Menu className="w-4 h-4" />
          <span>{navItems.find((i) => i.id === activeTab)?.label}</span>
        </button>
        <button type="button" onClick={onLogout} className="text-xs text-slate-300 flex items-center gap-1.5">
          <LogOut className="w-4 h-4" />
          <span>Chiqish</span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden bg-slate-900 border-t border-slate-800 px-4 py-3 grid grid-cols-2 gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  activeTab === item.id ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
        {actionMsg && (
          <div
            className={`p-3.5 rounded-xl border text-sm flex items-center justify-between ${
              actionMsg.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <span>{actionMsg.text}</span>
            <button type="button" onClick={() => setActionMsg(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ===================================== */}
          {/* ADMIN DASHBOARD */}
          {/* ===================================== */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="adm-dash"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Administrator boshqaruv paneli</h1>
                <p className="text-sm text-slate-500 mt-0.5">Maktab test platformasining umumiy holati</p>
              </div>

              {dash && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { label: 'Jami o‘qituvchilar', val: dash.stats.teachers, icon: GraduationCap },
                      { label: 'Jami testlar', val: dash.stats.tests, icon: ClipboardList },
                      { label: 'Faol testlar', val: dash.stats.activeTests, icon: CheckCircle2 },
                      { label: 'Jami o‘quvchilar', val: dash.stats.students, icon: Users },
                      { label: 'Topshirilgan testlar', val: dash.stats.submissions, icon: BookOpen },
                    ].map((k, idx) => {
                      const Icon = k.icon;
                      return (
                        <motion.div
                          key={k.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          whileHover={{ y: -3 }}
                          className="glass-surface-strong rounded-2xl p-5 transition-shadow hover:shadow-xl"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-slate-500">{k.label}</p>
                            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-white flex items-center justify-center text-indigo-600 shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                          </div>
                          <p className="text-3xl font-bold text-slate-900 mt-2 font-display tabular-nums">
                            {k.val}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-surface-strong rounded-3xl p-6">
                      <h3 className="text-base font-semibold text-slate-900 mb-4">Fanlar bo‘yicha testlar soni</h3>
                      <ClassBarChart
                        unit=" ta"
                        data={dash.testsBySubject.slice(0, 7).map((s) => ({
                          label: s.subject_name.split(' ')[0],
                          value: s.test_count,
                        }))}
                      />
                    </div>

                    <div className="glass-surface-strong rounded-3xl p-6">
                      <h3 className="text-base font-semibold text-slate-900 mb-4">So‘nggi tizim faoliyati</h3>
                      {dash.recentActivity.length === 0 ? (
                        <p className="text-sm text-slate-400">Hali faoliyat qayd etilmagan.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                          {dash.recentActivity.map((log) => (
                            <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                              <div>
                                <span className="font-semibold text-slate-900">{log.actor_name}</span>{' '}
                                <span className="text-slate-600">{log.action}</span>
                                {log.details && <span className="text-slate-400"> · {log.details}</span>}
                              </div>
                              <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                                {formatDateTimeUz(log.created_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ===================================== */}
          {/* ADMIN: TEACHERS */}
          {/* ===================================== */}
          {activeTab === 'teachers' && (
            <motion.div
              key="adm-teachers"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">O‘qituvchilarni boshqarish</h1>
                  <p className="text-sm text-slate-500 mt-0.5">O‘qituvchi hisoblarini yaratish, tahrirlash va o‘chirish</p>
                </div>
                <button
                  type="button"
                  onClick={openAddTeacher}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>O‘qituvchi qo‘shish</span>
                </button>
              </div>

              <div className="glass-surface-strong rounded-3xl overflow-hidden">
                {teachers.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    Hozircha o‘qituvchilar qo‘shilmagan. Birinchi o‘qituvchini yarating.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">F.I.Sh</th>
                          <th className="py-3 px-3">Login</th>
                          <th className="py-3 px-3">Fanlar</th>
                          <th className="py-3 px-3">Sinflar</th>
                          <th className="py-3 px-3 text-right">Testlar</th>
                          <th className="py-3 px-3">Holat</th>
                          <th className="py-3 px-4 text-right">Amallar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {teachers.map((t) => (
                          <tr key={t.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{t.fullName}</td>
                            <td className="py-3 px-3 font-mono text-xs text-slate-600">{t.username}</td>
                            <td className="py-3 px-3 text-xs text-slate-600">
                              {t.subjectNames.join(', ') || '—'}
                            </td>
                            <td className="py-3 px-3 text-xs text-slate-600">
                              {t.assignedClasses.join(', ') || 'Barchasi'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{t.testCount}</td>
                            <td className="py-3 px-3 text-xs">
                              <div className="flex flex-col gap-1">
                                <span className={t.isActive ? 'text-emerald-700 font-medium' : 'text-rose-600 font-medium'}>
                                  {t.isActive ? 'Faol' : 'Nofaol'}
                                </span>
                                <span className={t.isApproved ? 'text-sky-700 font-medium' : 'text-amber-700 font-medium'}>
                                  {t.isApproved ? 'Tasdiqlangan' : 'Tasdiq kutilmoqda'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditTeacher(t)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                  aria-label="Tahrirlash"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      open: true,
                                      danger: true,
                                      title: 'O‘qituvchini o‘chirish',
                                      message: `${t.fullName} hisobini va unga tegishli barcha testlarni o‘chirmoqchimisiz?`,
                                      onConfirm: async () => {
                                        await apiRequest(`/api/admin/teachers/${t.id}`, { method: 'DELETE' });
                                        setConfirmState(null);
                                        await loadAllBase();
                                      },
                                    })
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  aria-label="O‘chirish"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* ADMIN: TESTS MODERATION */}
          {/* ===================================== */}
          {activeTab === 'tests' && (
            <motion.div
              key="adm-tests"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Testlar nazorati</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Barcha o‘qituvchilar testlarini ko‘rish, bloklash, arxivlash va o‘chirish
                </p>
              </div>

              <div className="glass-surface-strong rounded-3xl overflow-hidden">
                {tests.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">Tizimda hali testlar mavjud emas.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">Test nomi</th>
                          <th className="py-3 px-3">O‘qituvchi</th>
                          <th className="py-3 px-3">Sinf / Fan</th>
                          <th className="py-3 px-3 text-right">Savol / Natija</th>
                          <th className="py-3 px-3">Holat</th>
                          <th className="py-3 px-4 text-right">Amallar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {tests.map((t) => (
                          <tr key={t.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{t.title}</td>
                            <td className="py-3 px-3 text-slate-600">{t.teacher_name}</td>
                            <td className="py-3 px-3 text-xs text-slate-600">
                              {t.class_name} · {t.subject_name}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs tabular-nums">
                              {t.question_count} / {t.submission_count}
                            </td>
                            <td className="py-3 px-3 text-xs font-semibold">
                              <span
                                className={
                                  t.status === 'active'
                                    ? 'text-emerald-700'
                                    : t.status === 'blocked'
                                    ? 'text-rose-600'
                                    : 'text-slate-600'
                                }
                              >
                                {t.status === 'active'
                                  ? 'Faol'
                                  : t.status === 'blocked'
                                  ? 'Bloklangan'
                                  : t.status === 'archived'
                                  ? 'Arxivlangan'
                                  : t.status === 'scheduled'
                                  ? 'Rejalashtirilgan'
                                  : 'Qoralama'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const next = t.status === 'blocked' ? 'active' : 'blocked';
                                    await apiRequest(`/api/admin/tests/${t.id}/status`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ status: next }),
                                    });
                                    loadTests();
                                  }}
                                  title={t.status === 'blocked' ? 'Blokdan chiqarish' : 'Vaqtincha bloklash'}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>{t.status === 'blocked' ? 'Ochish' : 'Bloklash'}</span>
                                </button>

                                {t.status !== 'archived' && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await apiRequest(`/api/admin/tests/${t.id}/status`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ status: 'archived' }),
                                      });
                                      loadTests();
                                    }}
                                    title="Arxivlash"
                                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                                  >
                                    <Archive className="w-4 h-4" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      open: true,
                                      danger: true,
                                      title: 'Testni butunlay o‘chirish',
                                      message:
                                        t.submission_count > 0
                                          ? `Diqqat! Ushbu testda ${t.submission_count} ta o‘quvchi natijasi mavjud. O‘chirish o‘rniga avval arxivlashingiz mumkin. Baribir butunlay o‘chirilsinmi?`
                                          : `"${t.title}" testini butunlay o‘chirmoqchimisiz?`,
                                      onConfirm: async () => {
                                        await apiRequest(`/api/admin/tests/${t.id}`, { method: 'DELETE' });
                                        setConfirmState(null);
                                        loadTests();
                                        loadAllBase();
                                      },
                                    })
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  aria-label="O‘chirish"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* ADMIN: ALL RESULTS */}
          {/* ===================================== */}
          {activeTab === 'results' && (
            <motion.div
              key="adm-results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Barcha o‘quvchilar natijalari</h1>
                  <p className="text-sm text-slate-500 mt-0.5">Maktab bo‘yicha natijalar va hujjat eksporti</p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={results.length === 0}
                    onClick={() => exportResultsToExcel(results, 'maktab_natijalari')}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    disabled={results.length === 0}
                    onClick={() =>
                      exportResultsToWord(results, {
                        schoolName,
                        subjectName:
                          subjects.find((s) => String(s.id) === resSubjectFilter)?.name || 'Barcha fanlar',
                        teacherName:
                          teachers.find((t) => String(t.id) === resTeacherFilter)?.fullName || 'Barcha o‘qituvchilar',
                        className:
                          classes.find((c) => String(c.id) === resClassFilter)?.name || 'Barcha sinflar',
                        testTitle: 'Maktab bo‘yicha umumiy natijalar',
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4 text-sky-300" />
                    <span>Word (.docx)</span>
                  </button>
                </div>
              </div>

              <div className="glass-surface-strong rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={resTeacherFilter}
                  onChange={(e) => setResTeacherFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-white/75 border border-white/90 rounded-xl"
                >
                  <option value="">Barcha o‘qituvchilar</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </select>
                <select
                  value={resClassFilter}
                  onChange={(e) => setResClassFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-white/75 border border-white/90 rounded-xl"
                >
                  <option value="">Barcha sinflar</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={resSubjectFilter}
                  onChange={(e) => setResSubjectFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-white/75 border border-white/90 rounded-xl"
                >
                  <option value="">Barcha fanlar</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="glass-surface-strong rounded-3xl overflow-hidden">
                {results.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">Natijalar topilmadi.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/70 bg-white/60 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">O‘quvchi</th>
                          <th className="py-3 px-3">Sinf</th>
                          <th className="py-3 px-3">Test / O‘qituvchi</th>
                          <th className="py-3 px-3 text-right">To‘g‘ri / Noto‘g‘ri</th>
                          <th className="py-3 px-3 text-right">Foiz</th>
                          <th className="py-3 px-3 text-center">Baho</th>
                          <th className="py-3 px-4 text-right">Sana</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 text-sm">
                        {results.map((r) => {
                          const isFlaggedRed = r.is_terminated === 1 || r.violation_count > 0;
                          return (
                            <tr
                              key={r.id}
                              className={
                                isFlaggedRed
                                  ? 'bg-rose-100/85 hover:bg-rose-100 text-rose-950 transition-colors'
                                  : 'hover:bg-white/60 transition-colors'
                              }
                            >
                              <td className="py-3 px-4">
                                <div className={isFlaggedRed ? 'font-bold text-rose-700' : 'font-medium text-slate-900'}>
                                  {r.first_name} {r.last_name}
                                </div>
                                {isFlaggedRed && (
                                  <div className="text-xs text-rose-600 font-medium">
                                    Testdan chiqarilgan
                                  </div>
                                )}
                              </td>
                              <td className={`py-3 px-3 ${isFlaggedRed ? 'text-rose-800 font-medium' : 'text-slate-700'}`}>
                                {r.class_name}
                              </td>
                              <td className="py-3 px-3">
                                <div className={`font-medium ${isFlaggedRed ? 'text-rose-900' : 'text-slate-900'}`}>
                                  {r.test_title}
                                </div>
                                <div className={`text-xs ${isFlaggedRed ? 'text-rose-700' : 'text-slate-500'}`}>
                                  {r.subject_name} · {r.teacher_name}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                {r.correct_count} / {r.wrong_count}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums">
                                {r.percentage.toFixed(1)}%
                              </td>
                              <td className="py-3 px-3 text-center font-bold tabular-nums">{r.grade}</td>
                              <td className={`py-3 px-4 text-right text-xs tabular-nums ${isFlaggedRed ? 'text-rose-700' : 'text-slate-500'}`}>
                                {formatDateTimeUz(r.submitted_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* ADMIN: CLASSES */}
          {/* ===================================== */}
          {activeTab === 'classes' && (
            <motion.div
              key="adm-classes"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Sinflarni boshqarish</h1>
                <p className="text-sm text-slate-500 mt-0.5">5-sinfdan 11-sinfgacha sinflar ro‘yxatini sozlang</p>
              </div>

              <form onSubmit={handleAddClass} className="glass-surface-strong rounded-3xl p-5 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Sinf darajasi</label>
                  <select
                    value={newClassGrade}
                    onChange={(e) => setNewClassGrade(Number(e.target.value))}
                    className="px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {[5, 6, 7, 8, 9, 10, 11].map((g) => (
                      <option key={g} value={g}>
                        {g}-sinf
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Sinf harfi</label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={newClassSection}
                    onChange={(e) => setNewClassSection(e.target.value.toUpperCase())}
                    placeholder="Masalan: E"
                    className="w-32 px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl uppercase"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                >
                  Sinf qo‘shish
                </button>
              </form>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {classes.map((c) => (
                  <div
                    key={c.id}
                    className={`bg-white rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                      c.is_active === 1 ? 'border-slate-200' : 'border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-slate-900">{c.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            open: true,
                            danger: true,
                            title: 'Sinfni o‘chirish',
                            message: `${c.name} sinfini o‘chirmoqchimisiz?`,
                            onConfirm: async () => {
                              try {
                                await apiRequest(`/api/admin/classes/${c.id}`, { method: 'DELETE' });
                                await loadAllBase();
                                onBootstrapRefresh();
                              } catch (err: any) {
                                setActionMsg({ type: 'err', text: err?.message || 'O‘chirib bo‘lmadi.' });
                              } finally {
                                setConfirmState(null);
                              }
                            },
                          })
                        }
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {c.student_count || 0} o‘quvchi · {c.test_count || 0} test
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleClass(c)}
                      className={`text-xs font-medium py-1 rounded-lg border ${
                        c.is_active === 1
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      {c.is_active === 1 ? 'Faol' : 'Nofaol'}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* ADMIN: SUBJECTS */}
          {/* ===================================== */}
          {activeTab === 'subjects' && (
            <motion.div
              key="adm-subjects"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Fanlarni boshqarish</h1>
                <p className="text-sm text-slate-500 mt-0.5">Maktab o‘quv fanlarini qo‘shish va tahrirlash</p>
              </div>

              <form onSubmit={handleAddSubject} className="glass-surface-strong rounded-3xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fan nomi</label>
                  <input
                    type="text"
                    required
                    value={newSubjName}
                    onChange={(e) => setNewSubjName(e.target.value)}
                    placeholder="Masalan: Huquqshunoslik"
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tavsif</label>
                  <input
                    type="text"
                    value={newSubjDesc}
                    onChange={(e) => setNewSubjDesc(e.target.value)}
                    placeholder="Qisqacha izoh..."
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                >
                  Fan qo‘shish
                </button>
              </form>

              <div className="glass-surface-strong rounded-3xl divide-y divide-slate-200/60">
                {subjects.map((s) => (
                  <div key={s.id} className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.description || 'Tavsif kiritilmagan'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 tabular-nums">{s.test_count || 0} ta test</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSubject(s)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium ${
                          s.is_active === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s.is_active === 1 ? 'Faol' : 'Nofaol'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            open: true,
                            danger: true,
                            title: 'Fanni o‘chirish',
                            message: `${s.name} fanini o‘chirmoqchimisiz?`,
                            onConfirm: async () => {
                              try {
                                await apiRequest(`/api/admin/subjects/${s.id}`, { method: 'DELETE' });
                                await loadAllBase();
                              } catch (err: any) {
                                setActionMsg({ type: 'err', text: err?.message || 'O‘chirib bo‘lmadi.' });
                              } finally {
                                setConfirmState(null);
                              }
                            },
                          })
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* ADMIN: STUDENTS & INDIVIDUAL CODES */}
          {/* ===================================== */}
          {activeTab === 'students' && (
            <motion.div
              key="adm-students"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">O‘quvchilar va individual kodlar</h1>
                <p className="text-sm text-slate-500 mt-0.5">Ro‘yxatdan o‘tgan o‘quvchilar va ularning identifikatsiya kodlari</p>
              </div>

              <div className="glass-surface-strong rounded-3xl overflow-hidden">
                {students.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">Hali o‘quvchilar tizimga kirmagan.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">F.I.Sh</th>
                          <th className="py-3 px-3">Sinf</th>
                          <th className="py-3 px-3">O‘quvchi kodi</th>
                          <th className="py-3 px-3 text-right">Urinishlar</th>
                          <th className="py-3 px-4 text-right">Amallar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {students.map((st) => (
                          <tr key={st.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">
                              {st.first_name} {st.last_name}
                            </td>
                            <td className="py-3 px-3 text-slate-700">{st.class_name}</td>
                            <td className="py-3 px-3 font-mono text-xs text-slate-700">
                              {editingStudent?.id === st.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={stCodeEdit}
                                    onChange={(e) => setStCodeEdit(e.target.value.toUpperCase())}
                                    className="px-2 py-1 border border-slate-300 rounded-lg uppercase w-32"
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await apiRequest(`/api/admin/students/${st.id}`, {
                                        method: 'PUT',
                                        body: JSON.stringify({
                                          firstName: st.first_name,
                                          lastName: st.last_name,
                                          classId: st.class_id,
                                          studentCode: stCodeEdit,
                                        }),
                                      });
                                      setEditingStudent(null);
                                      loadStudents();
                                    }}
                                    className="text-xs font-semibold text-sky-700"
                                  >
                                    Saqlash
                                  </button>
                                </div>
                              ) : (
                                st.student_code
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{st.attempt_count}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStudent(st);
                                    setStCodeEdit(st.student_code);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      open: true,
                                      danger: true,
                                      title: 'O‘quvchini o‘chirish',
                                      message: `${st.first_name} ${st.last_name} o‘quvchi yozuvini o‘chirmoqchimisiz?`,
                                      onConfirm: async () => {
                                        await apiRequest(`/api/admin/students/${st.id}`, { method: 'DELETE' });
                                        setConfirmState(null);
                                        loadStudents();
                                      },
                                    })
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* ADMIN: ACTIVITY & SETTINGS */}
          {/* ===================================== */}
          {activeTab === 'activity' && (
            <motion.div
              key="adm-activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Tizim faoliyati va sozlamalar</h1>
                <p className="text-sm text-slate-500 mt-0.5">Maktab sozlamalari, nazorat jurnali va audit</p>
              </div>

              <form onSubmit={handleSaveSettings} className="glass-surface-strong rounded-3xl p-6 space-y-4 max-w-2xl">
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <span>Maktab va administrator sozlamalari</span>
                </h3>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Maktab nomi (Word hisobotlarda chiqadi)</label>
                  <input
                    type="text"
                    required
                    value={settingsSchoolName}
                    onChange={(e) => setSettingsSchoolName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                {!envManagedPassword && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Administrator parolini yangilash (ixtiyoriy)
                    </label>
                    <input
                      type="password"
                      value={settingsNewPass}
                      onChange={(e) => setSettingsNewPass(e.target.value)}
                      placeholder="Kamida 8 ta belgi"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                >
                  Sozlamalarni saqlash
                </button>
              </form>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-surface-strong rounded-3xl p-6">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Tizim hodisalari jurnali</h3>
                  <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {activityLogs.length === 0 ? (
                      <p className="text-sm text-slate-400">Hali yozuvlar yo‘q.</p>
                    ) : (
                      activityLogs.map((l) => (
                        <div key={l.id} className="py-2.5 text-xs flex items-start justify-between gap-3">
                          <div>
                            <span className="font-semibold text-slate-900">{l.actor_name}</span>{' '}
                            <span className="text-slate-600">{l.action}</span>
                            {l.details && <span className="text-slate-400"> · {l.details}</span>}
                          </div>
                          <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                            {formatDateTimeUz(l.created_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="glass-surface-strong rounded-3xl p-6">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Test nazorati ogohlantirishlari</h3>
                  <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {violationLogs.length === 0 ? (
                      <p className="text-sm text-slate-400">Hali ogohlantirishlar yo‘q.</p>
                    ) : (
                      violationLogs.map((v) => (
                        <div key={v.id} className="py-2.5 text-xs flex items-start justify-between gap-3">
                          <div>
                            <span className="font-semibold text-slate-900">
                              {v.first_name} {v.last_name} ({v.class_name})
                            </span>
                            <p className="text-slate-600 mt-0.5">
                              {v.event_type} · {v.test_title} ({v.teacher_name})
                            </p>
                          </div>
                          <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                            {formatDateTimeUz(v.occurred_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add / Edit Teacher Modal */}
      <AnimatePresence>
        {teacherModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-8"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="text-base font-semibold">
                  {editingTeacher ? 'O‘qituvchini tahrirlash' : 'Yangi o‘qituvchi qo‘shish'}
                </h3>
                <button type="button" onClick={() => setTeacherModalOpen(false)}>
                  <X className="w-4 h-4 text-slate-300 hover:text-white" />
                </button>
              </div>

              <form onSubmit={handleSaveTeacher} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {tError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                    {tError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Ism</label>
                    <input
                      type="text"
                      required
                      value={tFirstName}
                      onChange={(e) => setTFirstName(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Familiya</label>
                    <input
                      type="text"
                      required
                      value={tLastName}
                      onChange={(e) => setTLastName(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Login</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingTeacher)}
                      value={tUsername}
                      onChange={(e) => setTUsername(e.target.value)}
                      placeholder="a.karimov"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {editingTeacher ? 'Yangi parol (ixtiyoriy)' : 'Parol'}
                    </label>
                    <input
                      type="password"
                      required={!editingTeacher}
                      value={tPassword}
                      onChange={(e) => setTPassword(e.target.value)}
                      placeholder="Kamida 6 ta belgi"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Fanlar</label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => {
                      const selected = tSubjects.includes(s.name);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setTSubjects((prev) =>
                              selected ? prev.filter((x) => x !== s.name) : [...prev, s.name]
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            selected
                              ? 'bg-slate-900 border-slate-900 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Dars beradigan sinflar</label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                    {classes.map((c) => {
                      const selected = tClasses.includes(c.name);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setTClasses((prev) =>
                              selected ? prev.filter((x) => x !== c.name) : [...prev, c.name]
                            )
                          }
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                            selected
                              ? 'bg-sky-600 border-sky-600 text-white'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Telefon</label>
                    <input
                      type="text"
                      value={tPhone}
                      onChange={(e) => setTPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  {editingTeacher && (
                    <div className="flex flex-col gap-3 pt-5">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          id="teacher-active-chk"
                          type="checkbox"
                          checked={tIsActive}
                          onChange={(e) => setTIsActive(e.target.checked)}
                          className="w-4 h-4 accent-slate-900"
                        />
                        Hisob faol
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          id="teacher-approved-chk"
                          type="checkbox"
                          checked={tIsApproved}
                          onChange={(e) => setTIsApproved(e.target.checked)}
                          className="w-4 h-4 accent-sky-600"
                        />
                        Ro‘yxatdan o‘tishi tasdiqlangan
                      </label>
                    </div>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setTeacherModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                  >
                    Saqlash
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={Boolean(confirmState?.open)}
        danger={confirmState?.danger}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        onConfirm={() => {
          if (confirmState) confirmState.onConfirm();
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
