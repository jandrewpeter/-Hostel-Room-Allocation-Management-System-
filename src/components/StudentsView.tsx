import React, { useState } from 'react';
import { Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import {
  validateStudentInput,
  type Student,
  type Allocation,
  type Room,
} from '../utils/allocation';

interface StudentsViewProps {
  students: Student[];
  allocations: Allocation[];
  rooms: Room[];
  onCreateStudent: (payload: {
    rollNumber: string;
    fullName: string;
    email: string;
    phone: string;
    department: string;
    academicYear: number;
    gender: string;
  }) => Promise<void>;
  onUpdateFeeStatus: (id: number, feeStatus: string) => Promise<void>;
  onDeleteStudent: (id: number) => Promise<void>;
}

export function StudentsView({
  students,
  allocations,
  rooms,
  onCreateStudent,
  onUpdateFeeStatus,
  onDeleteStudent,
}: StudentsViewProps) {
  const [search, setSearch] = useState('');
  const [placementFilter, setPlacementFilter] = useState<
    'all' | 'assigned' | 'unassigned'
  >('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form fields
  const [rollNumber, setRollNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [academicYear, setAcademicYear] = useState(1);
  const [gender, setGender] = useState('Male');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeAllocByStudent = new Map(
    allocations
      .filter((a) => a.status === 'Active')
      .map((a) => [a.studentId, a])
  );
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  const filteredStudents = students.filter((s) => {
    const hasRoom = activeAllocByStudent.has(s.id);
    if (placementFilter === 'assigned' && !hasRoom) return false;
    if (placementFilter === 'unassigned' && hasRoom) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOpenAdd = () => {
    setFieldErrors({});
    setSubmitError(null);
    setRollNumber('');
    setFullName('');
    setEmail('');
    setPhone('');
    setDepartment('');
    setAcademicYear(1);
    setGender('Male');
    setShowAddModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      rollNumber,
      fullName,
      email,
      phone,
      department,
      academicYear,
      gender,
    };
    const errors = validateStudentInput(payload);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onCreateStudent(payload);
      setShowAddModal(false);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to register student.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (student: Student) => {
    setActionError(null);
    try {
      await onDeleteStudent(student.id);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to delete student.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, roll no, or dept..."
              aria-label="Search students"
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 w-64"
            />
          </div>

          <div
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Filter students by placement"
          >
            {(
              [
                { id: 'all', label: 'All Students' },
                { id: 'assigned', label: 'Assigned' },
                { id: 'unassigned', label: 'Waitlisted' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPlacementFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  placementFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Student
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="p-1 hover:bg-red-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Student</th>
                <th className="py-3 px-4">Roll No.</th>
                <th className="py-3 px-4">Department & Year</th>
                <th className="py-3 px-4">Room Assignment</th>
                <th className="py-3 px-4">Fee Status</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-6 text-center">
                    <UserPlus
                      className="w-8 h-8 text-slate-400 mx-auto"
                      aria-hidden="true"
                    />
                    <p className="mt-2 font-medium text-slate-900">
                      No matching student records
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Register a new student or clear your search filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const alloc = activeAllocByStudent.get(st.id);
                  const room = alloc ? roomMap.get(alloc.roomId) : undefined;
                  return (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-slate-900">
                          {st.fullName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {st.email} · {st.gender}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                        {st.rollNumber}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div>{st.department}</div>
                        <div className="text-slate-400 tabular-nums">
                          Year {st.academicYear}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {alloc && room ? (
                          <span className="font-mono font-medium text-slate-900 tabular-nums">
                            Room {room.roomNumber} · {alloc.bedLabel}
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium">
                            Waitlisted (Unassigned)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={st.feeStatus}
                          onChange={(e) =>
                            onUpdateFeeStatus(st.id, e.target.value)
                          }
                          aria-label={`Fee status for ${st.fullName}`}
                          className={`text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 bg-white ${
                            st.feeStatus === 'Paid'
                              ? 'text-emerald-700'
                              : st.feeStatus === 'Overdue'
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                        >
                          <option value="Paid">Paid</option>
                          <option value="Pending">Pending</option>
                          <option value="Overdue">Overdue</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(st)}
                          aria-label={`Remove ${st.fullName}`}
                          className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-student-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3
                id="add-student-title"
                className="text-lg font-semibold text-slate-900"
              >
                Register Student Resident
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close add student modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {submitError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="student-fullname"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="student-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Subramanian"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  {fieldErrors.fullName && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="student-roll"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Roll Number
                  </label>
                  <input
                    id="student-roll"
                    type="text"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    placeholder="e.g. CS-2026-088"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  {fieldErrors.rollNumber && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.rollNumber}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="student-email"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    University Email
                  </label>
                  <input
                    id="student-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="priya@northgate.edu"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="student-phone"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Phone Number
                  </label>
                  <input
                    id="student-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555-390-2211"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  {fieldErrors.phone && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label
                    htmlFor="student-dept"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Department
                  </label>
                  <input
                    id="student-dept"
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Computer Science"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  {fieldErrors.department && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.department}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="student-year"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Academic Year
                  </label>
                  <select
                    id="student-year"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6].map((y) => (
                      <option key={y} value={y}>
                        Year {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="student-gender"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Wing Eligibility
                  </label>
                  <select
                    id="student-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-Binary">Non-Binary</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Register Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
