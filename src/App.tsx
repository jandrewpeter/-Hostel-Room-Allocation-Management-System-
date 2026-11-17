import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  BedDouble,
  Users,
  MapPin,
  Sparkles,
  FileCode2,
  Menu,
  X,
  LogOut,
  LogIn,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import {
  canAllocateStudentToRoom,
  computeOccupancyMetrics,
  computeRoomStatus,
  getNextAvailableBedLabel,
  validateStudentInput,
  type HostelBlock,
  type Room,
  type Student,
  type Allocation,
  type MaintenanceLog,
} from './utils/allocation';
import {
  SEED_BLOCKS,
  SEED_ROOMS,
  SEED_STUDENTS,
  SEED_ALLOCATIONS,
  SEED_MAINTENANCE,
} from './utils/seedData';
import { OverviewView } from './components/OverviewView';
import { RoomAllocationView } from './components/RoomAllocationView';
import { StudentsView } from './components/StudentsView';
import { CampusAreaView } from './components/CampusAreaView';
import { AiStudioView } from './components/AiStudioView';
import { SpringBootView } from './components/SpringBootView';

type ActiveTab =
  | 'overview'
  | 'allocation'
  | 'students'
  | 'campus'
  | 'ai'
  | 'spring';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'allocation', label: 'Room Allocation', icon: BedDouble },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'campus', label: 'Campus & Area', icon: MapPin },
  { id: 'ai', label: 'AI Studio', icon: Sparkles },
  { id: 'spring', label: 'Spring Boot', icon: FileCode2 },
];

export default function App() {
  const {
    user,
    loading: authLoading,
    previewMode,
    authError,
    signInWithGoogle,
    enterPreviewMode,
    logout,
    getIdToken,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [blocks, setBlocks] = useState<HostelBlock[]>(SEED_BLOCKS);
  const [rooms, setRooms] = useState<Room[]>(SEED_ROOMS);
  const [students, setStudents] = useState<Student[]>(SEED_STUDENTS);
  const [allocations, setAllocations] =
    useState<Allocation[]>(SEED_ALLOCATIONS);
  const [maintenanceLogs, setMaintenanceLogs] =
    useState<MaintenanceLog[]>(SEED_MAINTENANCE);

  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [allocateModalRoomId, setAllocateModalRoomId] = useState<number | null>(
    null
  );

  const loadCloudSqlState = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/hostel/state', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load hostel database.');
      }
      setBlocks(data.blocks);
      setRooms(data.rooms);
      setStudents(data.students);
      setAllocations(data.allocations);
      setMaintenanceLogs(data.maintenanceLogs);
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : 'Unable to load database state.'
      );
    } finally {
      setDataLoading(false);
    }
  }, [user, getIdToken]);

  useEffect(() => {
    if (user) {
      loadCloudSqlState();
    } else if (previewMode) {
      setBlocks(SEED_BLOCKS);
      setRooms(SEED_ROOMS);
      setStudents(SEED_STUDENTS);
      setAllocations(SEED_ALLOCATIONS);
      setMaintenanceLogs(SEED_MAINTENANCE);
    }
  }, [user, previewMode, loadCloudSqlState]);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = await getIdToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Operation failed.');
    }
    return data;
  };

  // Domain action handlers (Cloud SQL when signed in, pure local state in previewMode)
  const handleAllocate = async (payload: {
    studentId: number;
    roomId: number;
    academicTerm: string;
    notes: string;
  }) => {
    if (user) {
      await authFetch('/api/hostel/allocations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadCloudSqlState();
      return;
    }

    const student = students.find((s) => s.id === payload.studentId);
    const room = rooms.find((r) => r.id === payload.roomId);
    if (!student || !room) throw new Error('Student or room not found.');
    const block = blocks.find((b) => b.id === room.blockId);
    const activeAllocs = allocations.filter((a) => a.status === 'Active');
    const check = canAllocateStudentToRoom(student, room, block, activeAllocs);
    if (!check.ok) throw new Error(check.reason);

    const roomAllocs = activeAllocs.filter((a) => a.roomId === room.id);
    const bedLabel = getNextAvailableBedLabel(
      room.capacity,
      roomAllocs.map((a) => a.bedLabel)
    );
    if (!bedLabel) throw new Error('No vacant beds remaining.');

    const nextId =
      allocations.reduce((max, a) => Math.max(max, a.id), 0) + 1;
    const newAlloc: Allocation = {
      id: nextId,
      studentId: student.id,
      roomId: room.id,
      bedLabel,
      academicTerm: payload.academicTerm,
      status: 'Active',
      allocatedAt: new Date().toISOString(),
      vacatedAt: null,
      notes: payload.notes || null,
    };
    setAllocations((prev) => [newAlloc, ...prev]);
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== room.id) return r;
        const nextOcc = r.occupiedCount + 1;
        return {
          ...r,
          occupiedCount: nextOcc,
          status: computeRoomStatus(r.capacity, nextOcc, false),
        };
      })
    );
  };

  const handleVacate = async (allocationId: number) => {
    if (user) {
      await authFetch(`/api/hostel/allocations/${allocationId}/vacate`, {
        method: 'POST',
      });
      await loadCloudSqlState();
      return;
    }
    const target = allocations.find(
      (a) => a.id === allocationId && a.status === 'Active'
    );
    if (!target) return;
    setAllocations((prev) =>
      prev.map((a) =>
        a.id === allocationId
          ? { ...a, status: 'Vacated', vacatedAt: new Date().toISOString() }
          : a
      )
    );
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== target.roomId) return r;
        const nextOcc = Math.max(0, r.occupiedCount - 1);
        return {
          ...r,
          occupiedCount: nextOcc,
          status: computeRoomStatus(
            r.capacity,
            nextOcc,
            r.status === 'Maintenance'
          ),
        };
      })
    );
  };

  const handleTransfer = async (allocationId: number, targetRoomId: number) => {
    if (user) {
      await authFetch(`/api/hostel/allocations/${allocationId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ targetRoomId }),
      });
      await loadCloudSqlState();
      return;
    }
    const existing = allocations.find(
      (a) => a.id === allocationId && a.status === 'Active'
    );
    if (!existing) throw new Error('Active allocation not found.');
    const student = students.find((s) => s.id === existing.studentId);
    const oldRoom = rooms.find((r) => r.id === existing.roomId);
    const targetRoom = rooms.find((r) => r.id === targetRoomId);
    if (!student || !oldRoom || !targetRoom) {
      throw new Error('Room or student not found.');
    }
    const targetBlock = blocks.find((b) => b.id === targetRoom.blockId);
    const activeOther = allocations.filter(
      (a) => a.status === 'Active' && a.id !== existing.id
    );
    const check = canAllocateStudentToRoom(
      student,
      targetRoom,
      targetBlock,
      activeOther
    );
    if (!check.ok) throw new Error(check.reason);
    const bedLabel = getNextAvailableBedLabel(
      targetRoom.capacity,
      activeOther
        .filter((a) => a.roomId === targetRoom.id)
        .map((a) => a.bedLabel)
    );
    if (!bedLabel) throw new Error('No vacant beds in target room.');

    const nextId =
      allocations.reduce((max, a) => Math.max(max, a.id), 0) + 1;
    setAllocations((prev) => [
      {
        id: nextId,
        studentId: student.id,
        roomId: targetRoom.id,
        bedLabel,
        academicTerm: existing.academicTerm,
        status: 'Active',
        allocatedAt: new Date().toISOString(),
        vacatedAt: null,
        notes: `Transferred from ${oldRoom.roomNumber}`,
      },
      ...prev.map((a) =>
        a.id === existing.id
          ? {
              ...a,
              status: 'Transferred',
              vacatedAt: new Date().toISOString(),
            }
          : a
      ),
    ]);
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === oldRoom.id) {
          const occ = Math.max(0, r.occupiedCount - 1);
          return {
            ...r,
            occupiedCount: occ,
            status: computeRoomStatus(
              r.capacity,
              occ,
              r.status === 'Maintenance'
            ),
          };
        }
        if (r.id === targetRoom.id) {
          const occ = r.occupiedCount + 1;
          return {
            ...r,
            occupiedCount: occ,
            status: computeRoomStatus(r.capacity, occ, false),
          };
        }
        return r;
      })
    );
  };

  const handleToggleMaintenance = async (
    roomId: number,
    maintenance: boolean
  ) => {
    if (user) {
      await authFetch(`/api/hostel/rooms/${roomId}/maintenance`, {
        method: 'PATCH',
        body: JSON.stringify({ maintenance }),
      });
      await loadCloudSqlState();
      return;
    }
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              status: computeRoomStatus(r.capacity, r.occupiedCount, maintenance),
            }
          : r
      )
    );
  };

  const handleCreateRoom = async (payload: {
    blockId: number;
    roomNumber: string;
    floor: number;
    roomType: string;
    capacity: number;
    monthlyFee: number;
    amenities: string;
  }) => {
    if (user) {
      await authFetch('/api/hostel/rooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadCloudSqlState();
      return;
    }
    const cleanNum = payload.roomNumber.trim().toUpperCase();
    if (rooms.some((r) => r.roomNumber === cleanNum)) {
      throw new Error(`Room ${cleanNum} already exists.`);
    }
    const nextId = rooms.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    setRooms((prev) => [
      ...prev,
      {
        id: nextId,
        blockId: payload.blockId,
        roomNumber: cleanNum,
        floor: payload.floor,
        roomType: payload.roomType,
        capacity: payload.capacity,
        occupiedCount: 0,
        monthlyFee: payload.monthlyFee,
        status: 'Available',
        amenities: payload.amenities,
      },
    ]);
  };

  const handleCreateStudent = async (payload: {
    rollNumber: string;
    fullName: string;
    email: string;
    phone: string;
    department: string;
    academicYear: number;
    gender: string;
  }) => {
    if (user) {
      await authFetch('/api/hostel/students', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadCloudSqlState();
      return;
    }
    const errs = validateStudentInput(payload);
    if (Object.keys(errs).length > 0) {
      throw new Error(Object.values(errs)[0]);
    }
    const cleanRoll = payload.rollNumber.trim().toUpperCase();
    if (students.some((s) => s.rollNumber === cleanRoll)) {
      throw new Error('A student with this roll number already exists.');
    }
    const nextId = students.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    setStudents((prev) => [
      {
        id: nextId,
        rollNumber: cleanRoll,
        fullName: payload.fullName.trim(),
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone.trim(),
        department: payload.department.trim(),
        academicYear: payload.academicYear,
        gender: payload.gender,
        feeStatus: 'Pending',
      },
      ...prev,
    ]);
  };

  const handleUpdateFeeStatus = async (id: number, feeStatus: string) => {
    if (user) {
      await authFetch(`/api/hostel/students/${id}/fee`, {
        method: 'PATCH',
        body: JSON.stringify({ feeStatus }),
      });
      await loadCloudSqlState();
      return;
    }
    setStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, feeStatus } : s))
    );
  };

  const handleDeleteStudent = async (id: number) => {
    if (user) {
      await authFetch(`/api/hostel/students/${id}`, {
        method: 'DELETE',
      });
      await loadCloudSqlState();
      return;
    }
    const hasActive = allocations.some(
      (a) => a.studentId === id && a.status === 'Active'
    );
    if (hasActive) {
      throw new Error(
        'Cannot remove a student with an active bed allocation. Vacate their bed first.'
      );
    }
    setStudents((prev) => prev.filter((s) => s.id !== id));
  };

  const handleResolveMaintenance = async (id: number) => {
    if (user) {
      await authFetch(`/api/hostel/maintenance/${id}/resolve`, {
        method: 'PATCH',
      });
      await loadCloudSqlState();
      return;
    }
    setMaintenanceLogs((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: 'Resolved' } : m))
    );
  };

  const handleQuickAllocate = () => {
    const firstOpen = rooms.find(
      (r) => r.status !== 'Maintenance' && r.occupiedCount < r.capacity
    );
    setActiveTab('allocation');
    if (firstOpen) {
      setAllocateModalRoomId(firstOpen.id);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading Northgate Halls...</p>
      </div>
    );
  }

  // Sign-In Gate when unauthenticated and not in preview mode
  if (!user && !previewMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs items-stretch">
          <div className="lg:col-span-7 relative min-h-72 bg-slate-100">
            <img
              src="/src/assets/images/hero_hostel_campus_1794923688160.jpg"
              alt="Northgate Residence Halls campus exterior"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 text-white">
              <p className="text-xs font-medium text-slate-200">
                University Residential Life & Housing Operations
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold mt-1 tracking-tight">
                Northgate Halls Allocation Console
              </h1>
              <p className="text-sm text-slate-200 mt-2 max-w-lg leading-relaxed">
                Manage multi-wing room capacities, bed assignments, student rosters, facility holds, and Spring Boot / PostgreSQL data workflows in one place.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-between">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Warden & Staff Sign-In
                </h2>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  Authenticate with your university Google account to persist room allocations and resident records to PostgreSQL.
                </p>
              </div>

              {authError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
                >
                  {authError}
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  Sign in with Google
                </button>

                <button
                  type="button"
                  onClick={enterPreviewMode}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Open Interactive Preview
                </button>
              </div>
            </div>

            <div className="pt-6 mt-8 border-t border-slate-100 flex items-center gap-3">
              <img
                src="/src/assets/images/avatar_warden_1794923693982.jpg"
                alt="Dr. Eleanor Vance, Residence Dean"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-slate-200"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Office of Residence Life
                </p>
                <p className="text-xs text-slate-500">
                  3 Residence Wings · Fall 2026 Roster
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const metrics = computeOccupancyMetrics(rooms, students, allocations);
  const activeNavLabel =
    NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-6 flex items-center border-b border-slate-200">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Northgate Halls
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-blue-700' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/src/assets/images/avatar_warden_1794923693982.jpg"
              alt="Staff avatar"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {user?.displayName || user?.email || 'Warden Preview'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user ? 'Signed in' : 'Preview session'}
              </p>
            </div>
          </div>

          {user ? (
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              aria-label="Sign in with Google"
              title="Sign in with Google"
              className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-lg shrink-0"
            >
              <LogIn className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-full bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="font-display text-lg font-bold text-slate-900">
                Northgate Halls
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg ${
                      active
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">
                Northgate Halls
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">
                {activeNavLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!user && (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                Sign in with Google
              </button>
            )}
            <button
              type="button"
              onClick={handleQuickAllocate}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Allocate Bed
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {dataError && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between"
            >
              <span>{dataError}</span>
              <button
                type="button"
                onClick={loadCloudSqlState}
                className="px-3 py-1 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}

          {dataLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-pulse">
              <div className="h-44 bg-slate-200/70 rounded-xl" />
              <div className="h-44 bg-slate-200/70 rounded-xl" />
              <div className="h-44 bg-slate-200/70 rounded-xl" />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  blocks={blocks}
                  rooms={rooms}
                  students={students}
                  allocations={allocations}
                  maintenanceLogs={maintenanceLogs}
                  metrics={metrics}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onQuickAllocate={handleQuickAllocate}
                  onResolveMaintenance={handleResolveMaintenance}
                />
              )}

              {activeTab === 'allocation' && (
                <RoomAllocationView
                  blocks={blocks}
                  rooms={rooms}
                  students={students}
                  allocations={allocations}
                  onAllocate={handleAllocate}
                  onVacate={handleVacate}
                  onTransfer={handleTransfer}
                  onToggleMaintenance={handleToggleMaintenance}
                  onCreateRoom={handleCreateRoom}
                  allocateModalRoomId={allocateModalRoomId}
                  setAllocateModalRoomId={setAllocateModalRoomId}
                />
              )}

              {activeTab === 'students' && (
                <StudentsView
                  students={students}
                  allocations={allocations}
                  rooms={rooms}
                  onCreateStudent={handleCreateStudent}
                  onUpdateFeeStatus={handleUpdateFeeStatus}
                  onDeleteStudent={handleDeleteStudent}
                />
              )}

              {activeTab === 'campus' && <CampusAreaView />}

              {activeTab === 'ai' && (
                <AiStudioView
                  blocks={blocks}
                  rooms={rooms}
                  students={students}
                  allocations={allocations}
                />
              )}

              {activeTab === 'spring' && <SpringBootView />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
