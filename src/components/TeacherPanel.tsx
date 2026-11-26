import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  PlusCircle,
  Save,
  ShieldAlert,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportResultsToExcel, exportResultsToWord, formatDateTimeUz, formatDurationUz } from '../lib/exportUtils';
import type {
  QuestionType,
  SchoolClass,
  SubjectItem,
  TeacherQuestionDraft,
  TeacherUser,
  TestRecord,
  TestResultRow,
  ViolationLogRow,
} from '../types';
import { ClassBarChart, GradeDistributionChart } from './Charts';
import { ConfirmModal } from './Modals';

type TeacherTab = 'dashboard' | 'create' | 'tests' | 'results' | 'statistics' | 'violations' | 'profile';

const emptyQuestion = (): TeacherQuestionDraft => ({
  questionType: 'single_choice',
  questionText: '',
  points: 1,
  correctTextAnswer: '',
  options: [
    { optionText: '', isCorrect: true },
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false },
  ],
});

export function TeacherPanel({
  user,
  onLogout,
  onProfileUpdate,
}: {
  user: TeacherUser;
  onLogout: () => void;
  onProfileUpdate: (patch: Partial<TeacherUser>) => void;
}) {
  const [activeTab, setActiveTab] = useState<TeacherTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Meta
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [schoolName, setSchoolName] = useState('SCHOOL TEST SYSTEM');
  const [teacherProfile, setTeacherProfile] = useState<TeacherUser>(user);

  // Dashboard
  const [dashLoading, setDashLoading] = useState(true);
  const [dashData, setDashData] = useState<{
    stats: {
      totalTests: number;
      activeTests: number;
      finishedTests: number;
      totalParticipants: number;
      totalSubmissions: number;
      avgPercentage: number;
      unreadViolations: number;
    };
    classStats: Array<{ class_name: string; submissions: number; avg_percentage: number }>;
    gradeDistribution: Array<{ grade: string; count: number }>;
    recentTests: TestRecord[];
  } | null>(null);

  // Tests
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [deleteTestTarget, setDeleteTestTarget] = useState<TestRecord | null>(null);

  // Create / Edit Test Form
  const [editingTestId, setEditingTestId] = useState<number | null>(null);
  const [testTitle, setTestTitle] = useState('');
  const [testSubjectId, setTestSubjectId] = useState('');
  const [testClassId, setTestClassId] = useState('');
  const [testDesc, setTestDesc] = useState('');
  const [testDuration, setTestDuration] = useState(30);
  const [testMaxAttempts, setTestMaxAttempts] = useState(1);
  const [testStartsAt, setTestStartsAt] = useState('');
  const [testEndsAt, setTestEndsAt] = useState('');
  const [testStatus, setTestStatus] = useState<'draft' | 'scheduled' | 'active'>('draft');
  const [questions, setQuestions] = useState<TeacherQuestionDraft[]>([emptyQuestion()]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Results
  const [results, setResults] = useState<TestResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [filterClassId, setFilterClassId] = useState('');
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [filterTestId, setFilterTestId] = useState('');
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Natijani tahrirlash modali va yashirin ko‘p bosish hisoblagichi.
  const [editingResult, setEditingResult] = useState<TestResultRow | null>(null);
  const [editCorrectCount, setEditCorrectCount] = useState('0');
  const [editPercentage, setEditPercentage] = useState('0');
  const [editGrade, setEditGrade] = useState('');
  const [editResultLoading, setEditResultLoading] = useState(false);
  const [editResultError, setEditResultError] = useState<string | null>(null);
  const nameClickTracker = useRef<{ resultId: number | null; timestamps: number[] }>({
    resultId: null,
    timestamps: [],
  });
  const resultsRequestSequence = useRef(0);

  // Statistics
  const [statsData, setStatsData] = useState<{
    testStats: Array<{
      id: number;
      title: string;
      subject_name: string;
      class_name: string;
      submissions: number;
      avg_percentage: number;
      max_percentage: number | null;
      min_percentage: number | null;
      grade_5: number;
      grade_4: number;
      grade_3: number;
      grade_2: number;
    }>;
    questionAccuracy: Array<{
      id: number;
      question_text: string;
      test_title: string;
      total_answers: number;
      correct_answers: number;
    }>;
  } | null>(null);

  // Violations
  const [violations, setViolations] = useState<ViolationLogRow[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(false);

  // Profile form
  const [profFirst, setProfFirst] = useState(user.firstName);
  const [profLast, setProfLast] = useState(user.lastName);
  const [profPhone, setProfPhone] = useState(user.phone || '');
  const [profBio, setProfBio] = useState(user.bio || '');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [profStatus, setProfStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const res = await apiRequest<{
        teacher: TeacherUser | null;
        classes: SchoolClass[];
        subjects: SubjectItem[];
        schoolName: string;
      }>('/api/teacher/meta');
      setClasses(res.classes);
      setSubjects(res.subjects);
      setSchoolName(res.schoolName);
      if (res.teacher) {
        setTeacherProfile({ ...res.teacher, role: 'teacher' });
        setProfFirst(res.teacher.firstName);
        setProfLast(res.teacher.lastName);
        setProfPhone(res.teacher.phone || '');
        setProfBio(res.teacher.bio || '');
      }
    } catch {
      // handled silently
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const data = await apiRequest<NonNullable<typeof dashData>>('/api/teacher/dashboard');
      setDashData(data);
    } finally {
      setDashLoading(false);
    }
  }, []);

  const loadTests = useCallback(async () => {
    setTestsLoading(true);
    try {
      const data = await apiRequest<{ tests: TestRecord[] }>('/api/teacher/tests');
      setTests(data.tests);
    } finally {
      setTestsLoading(false);
    }
  }, []);

  const loadResults = useCallback(async () => {
    const requestId = ++resultsRequestSequence.current;
    setResultsLoading(true);
    setResultsError(null);

    try {
      const params = new URLSearchParams();

      // Bo‘sh qiymat — "Barchasi". Barcha tanlangan filtrlar backendda AND bilan ishlaydi.
      if (filterClassId.trim()) params.set('classId', filterClassId.trim());
      if (filterSubjectId.trim()) params.set('subjectId', filterSubjectId.trim());
      if (filterTestId.trim()) params.set('testId', filterTestId.trim());

      const query = params.toString();
      const endpoint = `/api/teacher/results${query ? `?${query}` : ''}`;
      const data = await apiRequest<{ results?: TestResultRow[] }>(endpoint);

      // Tez ketma-ket filtr almashtirilganda eski so‘rov yangi natijani bosib ketmasin.
      if (requestId !== resultsRequestSequence.current) return;

      const rows = Array.isArray(data?.results) ? data.results : [];

      // Backend filtrlashiga qo‘shimcha himoya: ID lar string/number bo‘lishidan qat’i nazar solishtiriladi.
      const filteredRows = rows.filter((row) => {
        const classMatches =
          !filterClassId || Number(row.class_id) === Number(filterClassId);
        const subjectMatches =
          !filterSubjectId || Number(row.subject_id) === Number(filterSubjectId);
        const testMatches =
          !filterTestId || Number(row.test_id) === Number(filterTestId);

        return classMatches && subjectMatches && testMatches;
      });

      setResults(filteredRows);
    } catch (error: unknown) {
      if (requestId !== resultsRequestSequence.current) return;
      const message =
        error instanceof Error ? error.message : 'Natijalarni yuklashda xatolik yuz berdi.';
      setResultsError(message);
      setResults([]);
    } finally {
      if (requestId === resultsRequestSequence.current) {
        setResultsLoading(false);
      }
    }
  }, [filterClassId, filterSubjectId, filterTestId]);

  const handleStudentNameClick = (row: TestResultRow) => {
    const now = Date.now();
    const tracker = nameClickTracker.current;

    const timestamps =
      tracker.resultId === row.id
        ? tracker.timestamps.filter((timestamp) => now - timestamp <= 2000)
        : [];

    timestamps.push(now);
    nameClickTracker.current = { resultId: row.id, timestamps };

    if (timestamps.length >= 5) {
      nameClickTracker.current = { resultId: null, timestamps: [] };
      setEditingResult(row);
      setEditCorrectCount(String(row.correct_count));
      setEditPercentage(String(row.percentage));
      setEditGrade('');
      setEditResultError(null);
    }
  };

  const handleSaveResultEdit = async () => {
    if (!editingResult || editResultLoading) return;

    const correctCount = Number(editCorrectCount);
    const percentage = Number(editPercentage);

    if (
      !Number.isInteger(correctCount) ||
      correctCount < 0 ||
      correctCount > Number(editingResult.total_questions)
    ) {
      setEditResultError(
        `To‘g‘ri javoblar soni 0 dan ${editingResult.total_questions} gacha bo‘lishi kerak.`
      );
      return;
    }

    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setEditResultError('Foiz 0 dan 100 gacha bo‘lishi kerak.');
      return;
    }

    if (editGrade && !['2', '3', '4', '5'].includes(editGrade)) {
      setEditResultError('Baho noto‘g‘ri tanlangan.');
      return;
    }

    setEditResultLoading(true);
    setEditResultError(null);

    try {
      await apiRequest(`/api/teacher/results/${editingResult.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          correct_count: correctCount,
          percentage,
          grade: editGrade || null,
        }),
      });

      setEditingResult(null);
      await loadResults();

      // Qo‘shimcha panellar yangilanishi natija saqlanishiga xalaqit bermasligi kerak.
      void loadStatistics().catch(() => undefined);
      void loadDashboard().catch(() => undefined);
    } catch (error: unknown) {
      setEditResultError(
        error instanceof Error ? error.message : 'Natijani saqlashda xatolik yuz berdi.'
      );
    } finally {
      setEditResultLoading(false);
    }
  };

  const loadStatistics = useCallback(async () => {
    const data = await apiRequest<NonNullable<typeof statsData>>('/api/teacher/statistics');
    setStatsData(data);
  }, []);

  const loadViolations = useCallback(async () => {
    setViolationsLoading(true);
    try {
      const data = await apiRequest<{ violations: ViolationLogRow[] }>('/api/teacher/violations');
      setViolations(data.violations);
    } finally {
      setViolationsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeta();
    loadDashboard();
    loadTests();
  }, [loadMeta, loadDashboard, loadTests]);

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboard();
    if (activeTab === 'tests') loadTests();
    if (activeTab === 'results') {
      loadTests();
      loadResults();
    }
    if (activeTab === 'statistics') loadStatistics();
    if (activeTab === 'violations') loadViolations();
  }, [activeTab, loadDashboard, loadTests, loadResults, loadStatistics, loadViolations]);

  useEffect(() => {
    return () => {
      // Komponent yopilganda tugallanmagan natija so‘rovlari eskirgan deb belgilanadi.
      resultsRequestSequence.current += 1;
    };
  }, []);

  const resetBuilder = () => {
    setEditingTestId(null);
    setTestTitle('');
    setTestSubjectId(
      user.preferredSubjectId
        ? String(user.preferredSubjectId)
        : subjects[0]
        ? String(subjects[0].id)
        : ''
    );
    setTestClassId(
      user.preferredClassId
        ? String(user.preferredClassId)
        : classes[0]
        ? String(classes[0].id)
        : ''
    );
    setTestDesc('');
    setTestDuration(30);
    setTestMaxAttempts(1);
    setTestStartsAt('');
    setTestEndsAt('');
    setTestStatus('draft');
    setQuestions([emptyQuestion()]);
    setSaveMessage(null);
  };

  const openEditTest = async (testId: number) => {
    setSaveMessage(null);
    try {
      const data = await apiRequest<{ test: TestRecord; questions: TeacherQuestionDraft[] }>(
        `/api/teacher/tests/${testId}`
      );
      setEditingTestId(data.test.id);
      setTestTitle(data.test.title);
      setTestSubjectId(String(data.test.subject_id));
      setTestClassId(String(data.test.class_id));
      setTestDesc(data.test.description || '');
      setTestDuration(data.test.duration_minutes);
      setTestMaxAttempts(data.test.max_attempts);
      setTestStartsAt(data.test.starts_at ? data.test.starts_at.slice(0, 16) : '');
      setTestEndsAt(data.test.ends_at ? data.test.ends_at.slice(0, 16) : '');
      setTestStatus(
        data.test.status === 'active' || data.test.status === 'scheduled' ? data.test.status : 'draft'
      );
      setQuestions(
        data.questions.length > 0
          ? data.questions.map((q) => ({
              ...q,
              options:
                q.options && q.options.length > 0
                  ? q.options
                  : [
                      { optionText: '', isCorrect: true },
                      { optionText: '', isCorrect: false },
                    ],
            }))
          : [emptyQuestion()]
      );
      setActiveTab('create');
    } catch (err: any) {
      setSaveMessage({ type: 'err', text: err?.message || 'Testni yuklab bo‘lmadi.' });
    }
  };

  const handleSaveTest = async (targetStatus: 'draft' | 'scheduled' | 'active') => {
    setSaveMessage(null);
    setSaveLoading(true);
    try {
      const payload = {
        title: testTitle.trim(),
        subjectId: Number(testSubjectId),
        classId: Number(testClassId),
        description: testDesc.trim(),
        durationMinutes: Number(testDuration),
        maxAttempts: Number(testMaxAttempts),
        startsAt: testStartsAt ? new Date(testStartsAt).toISOString() : null,
        endsAt: testEndsAt ? new Date(testEndsAt).toISOString() : null,
        status: targetStatus,
        questions,
      };

      if (editingTestId) {
        await apiRequest(`/api/teacher/tests/${editingTestId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setSaveMessage({ type: 'ok', text: 'Test muvaffaqiyatli yangilandi.' });
      } else {
        await apiRequest('/api/teacher/tests', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSaveMessage({
          type: 'ok',
          text:
            targetStatus === 'active'
              ? 'Test yaratildi va o‘quvchilar uchun faollashtirildi!'
              : 'Test muvaffaqiyatli saqlandi!',
        });
        resetBuilder();
      }
      loadTests();
      loadDashboard();
    } catch (err: any) {
      setSaveMessage({ type: 'err', text: err?.message || 'Saqlashda xatolik yuz berdi.' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTestStatusToggle = async (t: TestRecord, nextStatus: 'active' | 'draft' | 'archived') => {
    await apiRequest(`/api/teacher/tests/${t.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    loadTests();
    loadDashboard();
  };

  const handleConfirmDeleteTest = async () => {
    if (!deleteTestTarget) return;
    await apiRequest(`/api/teacher/tests/${deleteTestTarget.id}`, { method: 'DELETE' });
    setDeleteTestTarget(null);
    loadTests();
    loadDashboard();
  };

  const handleReviewViolation = async (id: number) => {
    await apiRequest(`/api/teacher/violations/${id}/review`, { method: 'PATCH' });
    setViolations((prev) => prev.map((v) => (v.id === id ? { ...v, reviewed_by_teacher: 1 } : v)));
    loadDashboard();
  };

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setProfStatus(null);
    try {
      const res = await apiRequest<{ success: boolean; fullName: string }>('/api/teacher/profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: profFirst.trim(),
          lastName: profLast.trim(),
          phone: profPhone.trim(),
          bio: profBio.trim(),
          currentPassword: curPass,
          newPassword: newPass,
        }),
      });
      setCurPass('');
      setNewPass('');
      onProfileUpdate({
        firstName: profFirst.trim(),
        lastName: profLast.trim(),
        fullName: res.fullName,
        phone: profPhone.trim(),
        bio: profBio.trim(),
      });
      setProfStatus({ type: 'ok', text: 'Profil ma’lumotlari saqlandi.' });
    } catch (err: any) {
      setProfStatus({ type: 'err', text: err?.message || 'Saqlashda xatolik.' });
    }
  };

  const gradeCounts = useMemo(() => {
    const counts = { '5': 0, '4': 0, '3': 0, '2': 0 };
    if (dashData?.gradeDistribution) {
      for (const row of dashData.gradeDistribution) {
        if (row.grade === '5' || row.grade === '4' || row.grade === '3' || row.grade === '2') {
          counts[row.grade] = row.count;
        }
      }
    }
    return counts;
  }, [dashData]);

  const navItems: Array<{ id: TeacherTab; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'create', label: 'Test yaratish', icon: PlusCircle },
    { id: 'tests', label: 'Mening testlarim', icon: ClipboardList },
    { id: 'results', label: 'O‘quvchilar natijalari', icon: BookOpen },
    { id: 'statistics', label: 'Test statistikasi', icon: BarChart3 },
    {
      id: 'violations',
      label: 'Ogohlantirishlar',
      icon: ShieldAlert,
      badge: dashData?.stats.unreadViolations || 0,
    },
    { id: 'profile', label: 'Profil sozlamalari', icon: User },
  ];

  const wordExportMeta = useMemo(() => {
    const selectedTest = tests.find((t) => String(t.id) === filterTestId);
    const selectedClass = classes.find((c) => String(c.id) === filterClassId);
    const selectedSubj = subjects.find((s) => String(s.id) === filterSubjectId);
    return {
      schoolName,
      subjectName: selectedSubj?.name || selectedTest?.subject_name || teacherProfile.subjectNames.join(', ') || 'Barcha fanlar',
      teacherName: teacherProfile.fullName,
      className: selectedClass?.name || selectedTest?.class_name || 'Barcha sinflar',
      testTitle: selectedTest?.title || 'Umumiy test natijalari',
    };
  }, [tests, classes, subjects, filterTestId, filterClassId, filterSubjectId, schoolName, teacherProfile]);

  const statusText = (s: TestRecord['status']) => {
    switch (s) {
      case 'active':
        return 'Faol';
      case 'scheduled':
        return 'Rejalashtirilgan';
      case 'draft':
        return 'Qoralama';
      case 'blocked':
        return 'Bloklangan';
      case 'archived':
        return 'Arxivlangan';
    }
  };

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col lg:flex-row">
      {/* Desktop Frosted Glass Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white/60 backdrop-blur-2xl border-r border-white/80 p-4 justify-between">
        <div className="space-y-6">
          <div className="px-3 py-2.5 border-b border-slate-200/60">
            <p className="text-sm font-bold text-slate-900 truncate">{teacherProfile.fullName}</p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {teacherProfile.subjectNames.length > 0
                ? teacherProfile.subjectNames.join(', ')
                : 'O‘qituvchi paneli'}
            </p>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'create' && activeTab !== 'create' && !editingTestId) {
                      resetBuilder();
                    }
                    setActiveTab(item.id);
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                        active ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2.5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Chiqish</span>
        </button>
      </aside>

      {/* Mobile Top Nav Bar */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 flex items-center gap-2"
        >
          <Menu className="w-4 h-4" />
          <span>{navItems.find((i) => i.id === activeTab)?.label}</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="text-xs font-medium text-slate-600 hover:text-rose-700 flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          <span>Chiqish</span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 grid grid-cols-2 gap-2">
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
                  activeTab === item.id ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-700'
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
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
        <AnimatePresence mode="wait">
          {/* ===================================== */}
          {/* TAB 1: DASHBOARD */}
          {/* ===================================== */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">O‘qituvchi boshqaruv paneli</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Testlaringiz va o‘quvchilar faolligi bo‘yicha umumiy ko‘rsatkichlar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetBuilder();
                    setActiveTab('create');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yangi test yaratish</span>
                </button>
              </div>

              {dashLoading || !dashData ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="glass-surface rounded-2xl p-5 h-28 animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Jami testlar', value: dashData.stats.totalTests, sub: 'Yaratilgan barcha testlar', icon: ClipboardList },
                      { label: 'Jami qatnashgan o‘quvchilar', value: dashData.stats.totalParticipants, sub: `${dashData.stats.totalSubmissions} ta topshirish`, icon: User },
                      { label: 'Faol testlar', value: dashData.stats.activeTests, sub: 'Hozirda ochiq testlar', icon: BookOpen },
                      { label: 'Yakunlangan testlar', value: dashData.stats.finishedTests, sub: `O‘rtacha ball: ${dashData.stats.avgPercentage}%`, icon: BarChart3 },
                    ].map((kpi, idx) => {
                      const Icon = kpi.icon;
                      return (
                        <motion.div
                          key={kpi.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          whileHover={{ y: -3 }}
                          className="glass-surface-strong rounded-2xl p-5 transition-shadow hover:shadow-xl"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-white flex items-center justify-center text-sky-700 shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                          </div>
                          <p className="text-3xl font-bold text-slate-900 mt-2 font-display tabular-nums">
                            {kpi.value}
                          </p>
                          <p className="text-xs text-slate-400 mt-1 tabular-nums">{kpi.sub}</p>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-surface-strong rounded-3xl p-6">
                      <h3 className="text-base font-semibold text-slate-900 mb-1">
                        Sinflar bo‘yicha o‘rtacha ko‘rsatkich
                      </h3>
                      <p className="text-xs text-slate-500 mb-4">Har bir sinfning o‘rtacha foiz natijasi</p>
                      <ClassBarChart
                        data={dashData.classStats.map((c) => ({
                          label: c.class_name,
                          value: c.avg_percentage || 0,
                          sublabel: `${c.submissions} ta`,
                        }))}
                      />
                    </div>

                    <div className="glass-surface-strong rounded-3xl p-6">
                      <h3 className="text-base font-semibold text-slate-900 mb-1">Baholar taqsimoti</h3>
                      <p className="text-xs text-slate-500 mb-4">Topshirilgan testlar bo‘yicha baholar</p>
                      <GradeDistributionChart grades={gradeCounts} />
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ===================================== */}
          {/* TAB 2: CREATE / EDIT TEST */}
          {/* ===================================== */}
          {activeTab === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {editingTestId ? 'Testni tahrirlash' : 'Yangi test yaratish'}
                  </h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Test sozlamalari va savollarini kiriting
                  </p>
                </div>
                {editingTestId && (
                  <button
                    type="button"
                    onClick={resetBuilder}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Yangi testga o‘tish
                  </button>
                )}
              </div>

              {saveMessage && (
                <div
                  className={`p-4 rounded-xl border text-sm flex items-center gap-2.5 ${
                    saveMessage.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {saveMessage.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{saveMessage.text}</span>
                </div>
              )}

              {/* Test Metadata Card */}
              <div className="glass-surface-strong rounded-3xl p-6 space-y-5">
                <h3 className="text-base font-semibold text-slate-900">Asosiy ma’lumotlar</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Test nomi</label>
                    <input
                      type="text"
                      value={testTitle}
                      onChange={(e) => setTestTitle(e.target.value)}
                      placeholder="Masalan: Kvadrat tenglamalar bo‘yicha nazorat ishi"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Fan</label>
                    <select
                      value={testSubjectId}
                      onChange={(e) => setTestSubjectId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    >
                      <option value="">Fanni tanlang</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Sinf</label>
                    <select
                      value={testClassId}
                      onChange={(e) => setTestClassId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    >
                      <option value="">Sinfni tanlang</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Davomiyligi (daqiqalarda)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={testDuration}
                      onChange={(e) => setTestDuration(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Ruxsat etilgan urinishlar soni
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={testMaxAttempts}
                      onChange={(e) => setTestMaxAttempts(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Boshlanish vaqti (ixtiyoriy)
                    </label>
                    <input
                      type="datetime-local"
                      value={testStartsAt}
                      onChange={(e) => setTestStartsAt(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Tugash vaqti (ixtiyoriy)
                    </label>
                    <input
                      type="datetime-local"
                      value={testEndsAt}
                      onChange={(e) => setTestEndsAt(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Test holati</label>
                    <select
                      value={testStatus}
                      onChange={(e) => setTestStatus(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    >
                      <option value="draft">Qoralama</option>
                      <option value="scheduled">Rejalashtirilgan</option>
                      <option value="active">Faol</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Test haqida qisqacha ma’lumot
                    </label>
                    <textarea
                      rows={2}
                      value={testDesc}
                      onChange={(e) => setTestDesc(e.target.value)}
                      placeholder="O‘quvchilar uchun qisqacha ko‘rsatma..."
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Questions Builder */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    Savollar ({questions.length} ta)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
                    className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Savol qo‘shish</span>
                  </button>
                </div>

                {questions.map((q, qIdx) => (
                  <div key={qIdx} className="glass-surface-strong rounded-3xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-900 tabular-nums">{qIdx + 1}-savol</span>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <select
                          value={q.questionType}
                          onChange={(e) => {
                            const nextType = e.target.value as QuestionType;
                            setQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx
                                  ? {
                                      ...item,
                                      questionType: nextType,
                                      correctTextAnswer: nextType === 'true_false' ? 'ha' : item.correctTextAnswer,
                                    }
                                  : item
                              )
                            );
                          }}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <option value="single_choice">Bitta to‘g‘ri javob</option>
                          <option value="multiple_choice">Bir nechta to‘g‘ri javob</option>
                          <option value="true_false">Ha yoki yo‘q</option>
                          <option value="text">Matnli javob</option>
                        </select>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Ball:</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={q.points}
                            onChange={(e) => {
                              const pts = Math.max(1, Number(e.target.value) || 1);
                              setQuestions((prev) =>
                                prev.map((item, idx) => (idx === qIdx ? { ...item, points: pts } : item))
                              );
                            }}
                            className="w-16 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
                          />
                        </div>

                        {questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            aria-label="Savolni o‘chirish"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={q.questionText}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item, idx) => (idx === qIdx ? { ...item, questionText: e.target.value } : item))
                        )
                      }
                      placeholder="Savol matnini kiriting..."
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                    />

                    {(q.questionType === 'single_choice' || q.questionType === 'multiple_choice') && (
                      <div className="space-y-2.5">
                        <p className="text-xs text-slate-500">
                          {q.questionType === 'single_choice'
                            ? 'To‘g‘ri javobni belgilang (1 ta)'
                            : 'Barcha to‘g‘ri javoblarni belgilang'}
                        </p>
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2.5">
                            <input
                              type={q.questionType === 'single_choice' ? 'radio' : 'checkbox'}
                              name={`q-correct-${qIdx}`}
                              checked={opt.isCorrect}
                              onChange={() => {
                                setQuestions((prev) =>
                                  prev.map((item, idx) => {
                                    if (idx !== qIdx) return item;
                                    return {
                                      ...item,
                                      options: item.options.map((o, i) =>
                                        q.questionType === 'single_choice'
                                          ? { ...o, isCorrect: i === oIdx }
                                          : i === oIdx
                                          ? { ...o, isCorrect: !o.isCorrect }
                                          : o
                                      ),
                                    };
                                  })
                                );
                              }}
                              className="w-4 h-4 accent-slate-900"
                            />
                            <input
                              type="text"
                              value={opt.optionText}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQuestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === qIdx
                                      ? {
                                          ...item,
                                          options: item.options.map((o, i) =>
                                            i === oIdx ? { ...o, optionText: val } : o
                                          ),
                                        }
                                      : item
                                  )
                                );
                              }}
                              placeholder={`${String.fromCharCode(65 + oIdx)} varianti`}
                              className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                            />
                            {q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setQuestions((prev) =>
                                    prev.map((item, idx) =>
                                      idx === qIdx
                                        ? { ...item, options: item.options.filter((_, i) => i !== oIdx) }
                                        : item
                                    )
                                  )
                                }
                                className="p-1.5 text-slate-400 hover:text-rose-600"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx
                                  ? { ...item, options: [...item.options, { optionText: '', isCorrect: false }] }
                                  : item
                              )
                            )
                          }
                          className="text-xs font-medium text-sky-700 hover:text-sky-900"
                        >
                          + Variant qo‘shish
                        </button>
                      </div>
                    )}

                    {q.questionType === 'true_false' && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-600">To‘g‘ri javob:</span>
                        {['ha', 'yoq'].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() =>
                              setQuestions((prev) =>
                                prev.map((item, idx) =>
                                  idx === qIdx ? { ...item, correctTextAnswer: val } : item
                                )
                              )
                            }
                            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border ${
                              q.correctTextAnswer === val
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            {val === 'ha' ? 'Ha' : 'Yo‘q'}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.questionType === 'text' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          To‘g‘ri matnli javob (bir nechta variant bo‘lsa | bilan ajrating)
                        </label>
                        <input
                          type="text"
                          value={q.correctTextAnswer}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, correctTextAnswer: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Masalan: Toshkent"
                          className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="glass-surface-strong rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yana savol qo‘shish</span>
                </button>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={() => handleSaveTest(testStatus)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-sm font-semibold flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Saqlash ({testStatus === 'draft' ? 'Qoralama' : testStatus === 'scheduled' ? 'Rejalashtirilgan' : 'Faol'})</span>
                  </button>
                  <button
                    type="button"
                    disabled={saveLoading}
                    onClick={() => handleSaveTest('active')}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    {saveLoading ? 'Saqlanmoqda...' : 'Saqlash va faollashtirish'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* TAB 3: MY TESTS */}
          {/* ===================================== */}
          {activeTab === 'tests' && (
            <motion.div
              key="tests"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Mening testlarim</h1>
                  <p className="text-sm text-slate-500 mt-0.5">Yaratgan barcha testlaringizni boshqaring</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetBuilder();
                    setActiveTab('create');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Test yaratish</span>
                </button>
              </div>

              {testsLoading ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                  Yuklanmoqda...
                </div>
              ) : tests.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                  <p className="text-base font-semibold text-slate-900">Hali testlar yaratilmagan</p>
                  <p className="text-sm text-slate-500">Birinchi testingizni yaratish uchun tugmani bosing.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tests.map((t, idx) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      whileHover={{ y: -3 }}
                      className="glass-surface-strong rounded-3xl p-6 space-y-4 transition-shadow hover:shadow-xl"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-medium text-sky-700">{t.subject_name}</span>
                            <span aria-hidden="true">·</span>
                            <span>{t.class_name}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                t.status === 'active'
                                  ? 'text-emerald-700 font-semibold'
                                  : t.status === 'blocked'
                                  ? 'text-rose-600 font-semibold'
                                  : 'text-slate-600'
                              }
                            >
                              {statusText(t.status)}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 mt-1">{t.title}</h3>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
                        <span>{t.question_count} ta savol</span>
                        <span>{t.duration_minutes} daqiqa</span>
                        <span>{t.submission_count} ta natija</span>
                        <span>Max urinish: {t.max_attempts}</span>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditTest(t.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Tahrirlash</span>
                          </button>

                          {t.status !== 'blocked' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleTestStatusToggle(t, t.status === 'active' ? 'draft' : 'active')
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                t.status === 'active'
                                  ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              }`}
                            >
                              {t.status === 'active' ? 'To‘xtatish' : 'Faollashtirish'}
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setDeleteTestTarget(t)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          aria-label="O‘chirish"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ===================================== */}
          {/* TAB 4: STUDENT RESULTS & EXPORTS */}
          {/* ===================================== */}
          {activeTab === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">O‘quvchilar natijalari</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Faqat sizning testlaringiz natijalari va eksport hujjatlari
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={results.length === 0}
                    onClick={() => exportResultsToExcel(results, 'oqituvchi_natijalari')}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    disabled={results.length === 0}
                    onClick={() => exportResultsToWord(results, wordExportMeta)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4 text-sky-300" />
                    <span>Word (.docx)</span>
                  </button>
                </div>
              </div>

              {resultsError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {resultsError}
                </div>
              )}

              {/* Filters */}
              <div className="glass-surface-strong rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={filterClassId}
                  onChange={(e) => setFilterClassId(e.target.value)}
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
                  value={filterSubjectId}
                  onChange={(e) => setFilterSubjectId(e.target.value)}
                  className="px-3 py-2 text-sm bg-white/75 border border-white/90 rounded-xl"
                >
                  <option value="">Barcha fanlar</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filterTestId}
                  onChange={(e) => setFilterTestId(e.target.value)}
                  className="px-3 py-2 text-sm bg-white/75 border border-white/90 rounded-xl"
                >
                  <option value="">Barcha testlar</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.class_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Results Table */}
              <div className="glass-surface-strong rounded-3xl overflow-hidden">
                {resultsLoading ? (
                  <div className="p-8 text-center text-sm text-slate-500">Natijalar yuklanmoqda...</div>
                ) : results.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    Tanlangan filtr bo‘yicha natijalar topilmadi.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/70 bg-white/60 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">O‘quvchi</th>
                          <th className="py-3 px-3">Sinf</th>
                          <th className="py-3 px-3">Test</th>
                          <th className="py-3 px-3">Boshlangan / Yakunlangan</th>
                          <th className="py-3 px-3 text-right">Sarflangan</th>
                          <th className="py-3 px-3 text-right">To‘g‘ri / Noto‘g‘ri</th>
                          <th className="py-3 px-3 text-right">Foiz</th>
                          <th className="py-3 px-4 text-center">Baho</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 text-sm">
                        {results.map((r) => {
                          const isFlaggedRed = Boolean(r.is_terminated) || Number(r.violation_count) > 0;
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
                                <div className="flex items-center gap-1.5">
                                  {isFlaggedRed && <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />}
                                  <button
                                    type="button"
                                    onClick={() => handleStudentNameClick(r)}
                                    className={`appearance-none border-0 bg-transparent p-0 text-left cursor-text ${
                                      isFlaggedRed
                                        ? 'font-bold text-rose-700'
                                        : 'font-medium text-slate-900'
                                    }`}
                                    aria-label={`${r.first_name} ${r.last_name}`}
                                  >
                                    {r.first_name} {r.last_name}
                                  </button>
                                </div>
                                <div className={`text-xs font-mono ${isFlaggedRed ? 'text-rose-600' : 'text-slate-400'}`}>
                                  {r.student_code}
                                  {isFlaggedRed ? ' · Testdan chiqarilgan (boshqa oynaga o‘tgan)' : ''}
                                </div>
                              </td>
                              <td className={`py-3 px-3 ${isFlaggedRed ? 'text-rose-800 font-medium' : 'text-slate-700'}`}>
                                {r.class_name}
                              </td>
                              <td className="py-3 px-3">
                                <div className={`font-medium ${isFlaggedRed ? 'text-rose-900' : 'text-slate-900'}`}>
                                  {r.test_title}
                                </div>
                                <div className={`text-xs ${isFlaggedRed ? 'text-rose-700' : 'text-slate-500'}`}>
                                  {r.subject_name}
                                </div>
                              </td>
                              <td className={`py-3 px-3 text-xs tabular-nums ${isFlaggedRed ? 'text-rose-800' : 'text-slate-600'}`}>
                                <div>{formatDateTimeUz(r.started_at)}</div>
                                <div className={isFlaggedRed ? 'text-rose-600' : 'text-slate-400'}>
                                  {formatDateTimeUz(r.submitted_at)}
                                </div>
                              </td>
                              <td className={`py-3 px-3 text-right text-xs tabular-nums ${isFlaggedRed ? 'text-rose-800' : 'text-slate-600'}`}>
                                {formatDurationUz(r.time_spent_seconds)}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                <span className="text-emerald-700 font-semibold">{r.correct_count}</span>
                                <span className="text-slate-400"> / </span>
                                <span className="text-rose-600 font-semibold">{r.wrong_count}</span>
                              </td>
                              <td className={`py-3 px-3 text-right font-mono font-semibold tabular-nums ${isFlaggedRed ? 'text-rose-800' : 'text-slate-900'}`}>
                                {(Number(r.percentage) || 0).toFixed(1)}%
                              </td>
                              <td className="py-3 px-4 text-center font-bold tabular-nums">
                                <span
                                  className={
                                    isFlaggedRed
                                      ? 'text-rose-700'
                                      : r.grade === '5'
                                      ? 'text-sky-700'
                                      : r.grade === '4'
                                      ? 'text-indigo-700'
                                      : r.grade === '3'
                                      ? 'text-slate-700'
                                      : 'text-rose-600'
                                  }
                                >
                                  {r.grade}
                                </span>
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
          {/* TAB 5: STATISTICS */}
          {/* ===================================== */}
          {activeTab === 'statistics' && (
            <motion.div
              key="statistics"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Test statistikasi</h1>
                <p className="text-sm text-slate-500 mt-0.5">Testlar kesimida o‘zlashtirish va murakkab savollar tahlili</p>
              </div>

              {!statsData ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                  Statistika yuklanmoqda...
                </div>
              ) : (
                <>
                  <div className="glass-surface-strong rounded-3xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-base font-semibold text-slate-900">Testlar bo‘yicha natijalar</h3>
                    </div>
                    {statsData.testStats.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500">Hali testlar mavjud emas.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                              <th className="py-3 px-4">Test</th>
                              <th className="py-3 px-3">Sinf</th>
                              <th className="py-3 px-3 text-right">Topshirganlar</th>
                              <th className="py-3 px-3 text-right">O‘rtacha %</th>
                              <th className="py-3 px-3 text-right">Min / Max</th>
                              <th className="py-3 px-4 text-right">5 / 4 / 3 / 2</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {statsData.testStats.map((row) => (
                              <tr key={row.id}>
                                <td className="py-3 px-4">
                                  <div className="font-medium text-slate-900">{row.title}</div>
                                  <div className="text-xs text-slate-500">{row.subject_name}</div>
                                </td>
                                <td className="py-3 px-3 text-slate-700">{row.class_name}</td>
                                <td className="py-3 px-3 text-right font-mono tabular-nums">{row.submissions}</td>
                                <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums">
                                  {row.avg_percentage}%
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-xs text-slate-600 tabular-nums">
                                  {row.min_percentage !== null ? `${row.min_percentage}% / ${row.max_percentage}%` : '—'}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                                  {row.grade_5} / {row.grade_4} / {row.grade_3} / {row.grade_2}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-base font-semibold text-slate-900">Eng ko‘p xato qilingan savollar</h3>
                    </div>
                    {statsData.questionAccuracy.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500">Hali yetarli javoblar mavjud emas.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {statsData.questionAccuracy.map((q) => {
                          const rate = Math.round((q.correct_answers / q.total_answers) * 100);
                          return (
                            <div key={q.id} className="p-4 px-6 flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">{q.question_text}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{q.test_title}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                                  {rate}% to‘g‘ri
                                </span>
                                <p className="text-xs text-slate-400 tabular-nums">
                                  {q.correct_answers} / {q.total_answers}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ===================================== */}
          {/* TAB 6: VIOLATION LOGS */}
          {/* ===================================== */}
          {activeTab === 'violations' && (
            <motion.div
              key="violations"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Nazorat ogohlantirishlari</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Test vaqtida boshqa oyna yoki tabga o‘tgan o‘quvchilar hodisalari
                </p>
              </div>

              <div className="glass-surface-strong rounded-3xl overflow-hidden">
                {violationsLoading ? (
                  <div className="p-8 text-center text-sm text-slate-500">Yuklanmoqda...</div>
                ) : violations.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-500">
                    Hozircha hech qanday nazorat ogohlantirishi qayd etilmagan.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200/60">
                    {violations.map((v) => {
                      const isRed = v.event_type !== 'tab_returned' || v.is_terminated === 1;
                      const evLabel =
                        v.event_type === 'tab_hidden'
                          ? 'Boshqa tabga o‘tdi (Testdan chiqarildi)'
                          : v.event_type === 'window_blur'
                          ? 'Oynadan chiqdi (Testdan chiqarildi)'
                          : 'Test sahifasiga qaytdi';
                      return (
                        <div
                          key={v.id}
                          className={`p-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 transition-colors ${
                            isRed ? 'bg-rose-100/80 hover:bg-rose-100' : 'hover:bg-white/60'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {isRed && <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />}
                              <span className={`text-sm ${isRed ? 'font-bold text-rose-700' : 'font-semibold text-slate-900'}`}>
                                {v.first_name} {v.last_name}
                              </span>
                              <span className={`text-xs ${isRed ? 'text-rose-700' : 'text-slate-500'}`}>· {v.class_name}</span>
                              <span className={`text-xs font-mono ${isRed ? 'text-rose-600' : 'text-slate-400'}`}>· {v.student_code}</span>
                            </div>
                            <p className={`text-xs ${isRed ? 'text-rose-800' : 'text-slate-600'}`}>
                              <span className={v.event_type === 'tab_returned' ? 'text-sky-700' : 'text-rose-700 font-bold'}>
                                {evLabel}
                              </span>{' '}
                              — {v.test_title}
                            </p>
                            <p className={`text-xs font-mono tabular-nums ${isRed ? 'text-rose-600' : 'text-slate-400'}`}>
                              {formatDateTimeUz(v.occurred_at)}
                            </p>
                          </div>

                          {v.reviewed_by_teacher === 1 ? (
                            <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Ko‘rib chiqilgan</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReviewViolation(v.id)}
                              className="px-3 py-1.5 rounded-xl bg-white/85 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-white"
                            >
                              Ko‘rib chiqildi
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ===================================== */}
          {/* TAB 7: PROFILE SETTINGS */}
          {/* ===================================== */}
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl space-y-6"
            >
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Profil sozlamalari</h1>
                <p className="text-sm text-slate-500 mt-0.5">Shaxsiy ma’lumotlaringiz va xavfsizlik</p>
              </div>

              <div className="glass-surface-strong rounded-3xl p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pb-4 border-b border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">Login</p>
                    <p className="font-mono font-medium text-slate-900 mt-0.5">{teacherProfile.username}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Biriktirilgan fanlar</p>
                    <p className="font-medium text-slate-900 mt-0.5">
                      {teacherProfile.subjectNames.join(', ') || 'Belgilanmagan'}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">Dars beradigan sinflar</p>
                    <p className="font-medium text-slate-900 mt-0.5">
                      {teacherProfile.assignedClasses.join(', ') || 'Barcha sinflar'}
                    </p>
                  </div>
                </div>

                {profStatus && (
                  <div
                    className={`p-3 rounded-xl text-sm border ${
                      profStatus.type === 'ok'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {profStatus.text}
                  </div>
                )}

                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Ism</label>
                      <input
                        type="text"
                        required
                        value={profFirst}
                        onChange={(e) => setProfFirst(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">Familiya</label>
                      <input
                        type="text"
                        required
                        value={profLast}
                        onChange={(e) => setProfLast(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Telefon raqam</label>
                    <input
                      type="text"
                      value={profPhone}
                      onChange={(e) => setProfPhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Qisqacha ma’lumot</label>
                    <textarea
                      rows={2}
                      value={profBio}
                      onChange={(e) => setProfBio(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <p className="text-xs font-semibold text-slate-700">Parolni o‘zgartirish (ixtiyoriy)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        type="password"
                        value={curPass}
                        onChange={(e) => setCurPass(e.target.value)}
                        placeholder="Joriy parol"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <input
                        type="password"
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="Yangi parol (kamida 8 belgi)"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                    >
                      O‘zgarishlarni saqlash
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {editingResult && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editResultLoading) {
              setEditingResult(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-edit-title"
            className="w-full max-w-md space-y-5 rounded-3xl border border-white/70 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="result-edit-title" className="text-lg font-bold text-slate-900">
                  Natijani tahrirlash
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {editingResult.first_name} {editingResult.last_name}
                </p>
                <p className="text-xs text-slate-500">{editingResult.test_title}</p>
              </div>
              <button
                type="button"
                disabled={editResultLoading}
                onClick={() => setEditingResult(null)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Yopish"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label htmlFor="result-edit-correct" className="mb-1.5 block text-sm font-medium text-slate-700">
                To‘g‘ri javoblar soni
              </label>
              <input
                id="result-edit-correct"
                type="number"
                min={0}
                max={editingResult.total_questions}
                step={1}
                value={editCorrectCount}
                onChange={(event) => setEditCorrectCount(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-xs text-slate-400">
                Jami savollar: {editingResult.total_questions}
              </p>
            </div>

            <div>
              <label htmlFor="result-edit-percentage" className="mb-1.5 block text-sm font-medium text-slate-700">
                Foiz
              </label>
              <input
                id="result-edit-percentage"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={editPercentage}
                onChange={(event) => setEditPercentage(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="result-edit-grade" className="mb-1.5 block text-sm font-medium text-slate-700">
                Baho
              </label>
              <select
                id="result-edit-grade"
                value={editGrade}
                onChange={(event) => setEditGrade(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                <option value="">Foiz bo‘yicha avtomatik</option>
                <option value="5">5 — a’lo</option>
                <option value="4">4 — yaxshi</option>
                <option value="3">3 — qoniqarli</option>
                <option value="2">2 — qoniqarsiz</option>
              </select>
            </div>

            {editResultError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {editResultError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={editResultLoading}
                onClick={() => setEditingResult(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={editResultLoading}
                onClick={handleSaveResultEdit}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editResultLoading ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTestTarget)}
        danger
        title="Testni o‘chirish"
        message={`"${deleteTestTarget?.title}" testini va unga tegishli barcha savollar hamda natijalarni o‘chirmoqchimisiz?`}
        confirmLabel="Ha, o‘chirish"
        onConfirm={handleConfirmDeleteTest}
        onCancel={() => setDeleteTestTarget(null)}
      />
    </div>
  );
}
