import {
  Building2,
  BedDouble,
  Users,
  Wrench,
  ArrowRight,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type {
  HostelBlock,
  Room,
  Student,
  Allocation,
  MaintenanceLog,
  OccupancyMetrics,
} from '../utils/allocation';

interface OverviewViewProps {
  blocks: HostelBlock[];
  rooms: Room[];
  students: Student[];
  allocations: Allocation[];
  maintenanceLogs: MaintenanceLog[];
  metrics: OccupancyMetrics;
  onNavigate: (tab: 'allocation' | 'students' | 'campus' | 'ai' | 'spring') => void;
  onQuickAllocate: () => void;
  onResolveMaintenance: (id: number) => void;
}

export function OverviewView({
  blocks,
  rooms,
  students,
  allocations,
  maintenanceLogs,
  metrics,
  onNavigate,
  onQuickAllocate,
  onResolveMaintenance,
}: OverviewViewProps) {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  const recentAllocations = allocations
    .filter((a) => a.status === 'Active')
    .slice(0, 6);

  const openMaintenance = maintenanceLogs.filter(
    (m) => m.status !== 'Resolved'
  );

  return (
    <div className="space-y-8">
      {/* Hero & Quick Operations Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="relative h-56 sm:h-64 bg-slate-100">
            <img
              src="/src/assets/images/hero_hostel_campus_1794923688160.jpg"
              alt="Northgate Residence Halls campus exterior and courtyard"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-900/25 to-transparent" />
            <div className="absolute bottom-5 left-6 right-6 text-white">
              <p className="text-xs font-medium tracking-wide text-slate-200">
                Fall 2026 Academic Term · Residence Operations
              </p>
              <h2 className="text-2xl font-semibold mt-1 tracking-tight">
                Northgate Residence Halls
              </h2>
            </div>
          </div>
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span className="whitespace-nowrap">{blocks.length} Residence Wings</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{rooms.length} Managed Rooms</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="tabular-nums font-medium text-slate-900 whitespace-nowrap">
                {metrics.vacantBeds} vacant beds ready
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('allocation')}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Open Room Matrix
              </button>
              <button
                type="button"
                onClick={onQuickAllocate}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Allocate Bed
              </button>
            </div>
          </div>
        </div>

        {/* Wing Capacity Summary */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Wing Occupancy Breakdown
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('allocation')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                Inspect rooms
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {blocks.map((block) => {
                const blockRooms = rooms.filter(
                  (r) => r.blockId === block.id && r.status !== 'Maintenance'
                );
                const cap = blockRooms.reduce((s, r) => s + r.capacity, 0);
                const occ = blockRooms.reduce((s, r) => s + r.occupiedCount, 0);
                const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0;

                return (
                  <div key={block.id} className="py-3.5 first:pt-1 last:pb-1">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{block.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {block.genderPolicy} Policy · {block.wardenName}
                        </p>
                      </div>
                      <div className="text-right tabular-nums">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {occ}/{cap}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {pct}% full
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-700 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{metrics.waitlistedStudents} students awaiting placement</span>
            <button
              type="button"
              onClick={() => onNavigate('students')}
              className="font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4"
            >
              View Directory
            </button>
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Bed Occupancy</span>
            <BedDouble className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {metrics.occupiedBeds} / {metrics.totalBeds}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.occupancyRate}% utilization · {metrics.vacantBeds} open
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Resident Roster</span>
            <Users className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {metrics.assignedStudents} / {metrics.totalStudents}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.waitlistedStudents} unassigned on waitlist
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Projected Monthly Fees</span>
            <Building2 className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            ${metrics.monthlyProjectedRevenue.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.pendingFeeCount} accounts pending or overdue
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Facility Holds</span>
            <Wrench className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {openMaintenance.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.maintenanceRooms} room offline for service
          </p>
        </div>
      </section>

      {/* Active Allocations & Maintenance Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              Recent Bed Assignments
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {allocations.filter((a) => a.status === 'Active').length} active
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-6">Student</th>
                  <th className="py-2.5 px-4">Room & Bed</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-6 text-right">Fee Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {recentAllocations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 px-6 text-center text-slate-500">
                      No active allocations yet. Assign a student to get started.
                    </td>
                  </tr>
                ) : (
                  recentAllocations.map((alloc) => {
                    const st = studentMap.get(alloc.studentId);
                    const rm = roomMap.get(alloc.roomId);
                    if (!st || !rm) return null;
                    return (
                      <tr key={alloc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-6">
                          <div className="font-medium text-slate-900">{st.fullName}</div>
                          <div className="text-xs font-mono text-slate-500 tabular-nums">
                            {st.rollNumber}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                          {rm.roomNumber} · {alloc.bedLabel}
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {st.department}
                        </td>
                        <td className="py-3 px-6 text-right text-xs font-medium">
                          <span
                            className={
                              st.feeStatus === 'Paid'
                                ? 'text-emerald-700'
                                : st.feeStatus === 'Overdue'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                            }
                          >
                            {st.feeStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              Maintenance Queue
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {openMaintenance.length} open
            </span>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {openMaintenance.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" aria-hidden="true" />
                <span>All residence wings are clear of open maintenance tickets.</span>
              </div>
            ) : (
              openMaintenance.map((ticket) => {
                const rm = roomMap.get(ticket.roomId);
                return (
                  <div
                    key={ticket.id}
                    className="p-5 flex items-start justify-between gap-4"
                  >
                    <div>
                      <div className="text-xs text-slate-500 font-mono tabular-nums">
                        Room {rm?.roomNumber ?? ticket.roomId} · {ticket.priority} Priority
                      </div>
                      <p className="text-sm font-medium text-slate-900 mt-1">
                        {ticket.title}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{ticket.status}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onResolveMaintenance(ticket.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Mark Resolved
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
