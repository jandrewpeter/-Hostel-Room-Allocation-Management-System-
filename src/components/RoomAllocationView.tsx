import React, { useState } from 'react';
import {
  BedDouble,
  Plus,
  Wrench,
  ArrowLeftRight,
  LogOut,
  Search,
  X,
} from 'lucide-react';
import {
  canAllocateStudentToRoom,
  type HostelBlock,
  type Room,
  type Student,
  type Allocation,
} from '../utils/allocation';

interface RoomAllocationViewProps {
  blocks: HostelBlock[];
  rooms: Room[];
  students: Student[];
  allocations: Allocation[];
  onAllocate: (payload: {
    studentId: number;
    roomId: number;
    academicTerm: string;
    notes: string;
  }) => Promise<void>;
  onVacate: (allocationId: number) => Promise<void>;
  onTransfer: (allocationId: number, targetRoomId: number) => Promise<void>;
  onToggleMaintenance: (roomId: number, maintenance: boolean) => Promise<void>;
  onCreateRoom: (payload: {
    blockId: number;
    roomNumber: string;
    floor: number;
    roomType: string;
    capacity: number;
    monthlyFee: number;
    amenities: string;
  }) => Promise<void>;
  allocateModalRoomId: number | null;
  setAllocateModalRoomId: (roomId: number | null) => void;
}

export function RoomAllocationView({
  blocks,
  rooms,
  students,
  allocations,
  onAllocate,
  onVacate,
  onTransfer,
  onToggleMaintenance,
  onCreateRoom,
  allocateModalRoomId,
  setAllocateModalRoomId,
}: RoomAllocationViewProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [academicTerm, setAcademicTerm] = useState('Fall 2026');
  const [allocNotes, setAllocNotes] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [transferAlloc, setTransferAlloc] = useState<Allocation | null>(null);
  const [transferTargetRoomId, setTransferTargetRoomId] = useState<string>('');

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomBlockId, setNewRoomBlockId] = useState<number>(blocks[0]?.id ?? 1);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState(1);
  const [newRoomType, setNewRoomType] = useState('Double Twin');
  const [newRoomCapacity, setNewRoomCapacity] = useState(2);
  const [newRoomFee, setNewRoomFee] = useState(480);
  const [newRoomAmenities, setNewRoomAmenities] = useState(
    'High-Speed Wi-Fi, Twin Oak Desks, En-suite Bath'
  );

  const blockMap = new Map(blocks.map((b) => [b.id, b]));
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const activeAllocations = allocations.filter((a) => a.status === 'Active');
  const assignedStudentIds = new Set(activeAllocations.map((a) => a.studentId));
  const unassignedStudents = students.filter(
    (s) => !assignedStudentIds.has(s.id)
  );

  const filteredRooms = rooms.filter((room) => {
    if (selectedBlockId !== 'all' && room.blockId !== selectedBlockId) {
      return false;
    }
    if (statusFilter !== 'all' && room.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const occupants = activeAllocations
        .filter((a) => a.roomId === room.id)
        .map((a) => studentMap.get(a.studentId)?.fullName.toLowerCase() ?? '');
      const matchesRoom = room.roomNumber.toLowerCase().includes(q);
      const matchesType = room.roomType.toLowerCase().includes(q);
      const matchesOccupant = occupants.some((name) => name.includes(q));
      return matchesRoom || matchesType || matchesOccupant;
    }
    return true;
  });

  const modalRoom =
    allocateModalRoomId !== null
      ? rooms.find((r) => r.id === allocateModalRoomId) ?? null
      : null;

  const openAllocateModal = (roomId: number) => {
    setModalError(null);
    setSelectedStudentId('');
    setAllocNotes('');
    setAllocateModalRoomId(roomId);
  };

  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalRoom) return;
    if (!selectedStudentId) {
      setModalError('Please select a student to assign.');
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      await onAllocate({
        studentId: Number(selectedStudentId),
        roomId: modalRoom.id,
        academicTerm,
        notes: allocNotes,
      });
      setAllocateModalRoomId(null);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Allocation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferAlloc || !transferTargetRoomId) {
      setModalError('Select a destination room.');
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      await onTransfer(transferAlloc.id, Number(transferTargetRoomId));
      setTransferAlloc(null);
      setTransferTargetRoomId('');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Transfer failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNumber.trim()) {
      setModalError('Room number is required.');
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      await onCreateRoom({
        blockId: newRoomBlockId,
        roomNumber: newRoomNumber,
        floor: newRoomFloor,
        roomType: newRoomType,
        capacity: newRoomCapacity,
        monthlyFee: newRoomFee,
        amenities: newRoomAmenities,
      });
      setShowCreateRoom(false);
      setNewRoomNumber('');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to add room.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColorText = (status: string) => {
    switch (status) {
      case 'Available':
        return 'text-emerald-700';
      case 'Partial':
        return 'text-blue-700';
      case 'Full':
        return 'text-slate-600';
      case 'Maintenance':
        return 'text-amber-700';
      default:
        return 'text-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room or occupant..."
              aria-label="Search room or occupant"
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 w-56"
            />
          </div>

          <select
            value={selectedBlockId}
            onChange={(e) =>
              setSelectedBlockId(
                e.target.value === 'all' ? 'all' : Number(e.target.value)
              )
            }
            aria-label="Filter by hostel block"
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Residence Wings</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.genderPolicy})
              </option>
            ))}
          </select>

          <div
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Filter rooms by status"
          >
            {['all', 'Available', 'Partial', 'Full', 'Maintenance'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? 'All' : st}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setModalError(null);
            setShowCreateRoom(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Room
        </button>
      </div>

      {/* Room Cards Grid */}
      {filteredRooms.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <BedDouble className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="mt-3 text-base font-medium text-slate-900">
            No matching rooms found
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Adjust your wing or status filter, or register a new room.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredRooms.map((room) => {
            const block = blockMap.get(room.blockId);
            const roomAllocations = activeAllocations.filter(
              (a) => a.roomId === room.id
            );
            const roomImage =
              room.capacity === 1
                ? '/src/assets/images/room_single_studio_1794923689753.jpg'
                : '/src/assets/images/room_double_suite_1794923687375.jpg';

            return (
              <article
                key={room.id}
                data-testid={`room-card-${room.roomNumber}`}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="h-36 bg-slate-100 relative">
                    <img
                      src={roomImage}
                      alt={`${room.roomType} interior for Room ${room.roomNumber}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                      <div>
                        <span className="font-mono text-lg font-semibold tabular-nums">
                          Room {room.roomNumber}
                        </span>
                        <p className="text-xs text-slate-200">
                          {block?.code} · Floor {room.floor} · {room.roomType}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-medium tabular-nums">
                        ${room.monthlyFee}/mo
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold ${statusColorText(room.status)}`}>
                        {room.status}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {room.occupiedCount} of {room.capacity} beds occupied
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      {room.amenities}
                    </p>

                    {/* Bed Slots */}
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {Array.from({ length: room.capacity }, (_, idx) => {
                        const bedLabel = `Bed ${idx + 1}`;
                        const alloc = roomAllocations.find(
                          (a) => a.bedLabel === bedLabel
                        );
                        const occupant = alloc
                          ? studentMap.get(alloc.studentId)
                          : undefined;

                        return (
                          <div
                            key={bedLabel}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-mono text-slate-400 mr-2">
                                {bedLabel}
                              </span>
                              {occupant ? (
                                <span className="font-medium text-slate-900 truncate">
                                  {occupant.fullName}
                                </span>
                              ) : (
                                <span className="text-slate-400">
                                  Vacant slot
                                </span>
                              )}
                            </div>

                            {alloc && occupant ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalError(null);
                                    setTransferTargetRoomId('');
                                    setTransferAlloc(alloc);
                                  }}
                                  aria-label={`Transfer ${occupant.fullName}`}
                                  title="Transfer resident"
                                  className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                >
                                  <ArrowLeftRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onVacate(alloc.id)}
                                  aria-label={`Vacate ${occupant.fullName} from ${room.roomNumber}`}
                                  title="Vacate bed"
                                  className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                >
                                  <LogOut className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Room Footer Actions */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={room.occupiedCount > 0}
                    onClick={() =>
                      onToggleMaintenance(room.id, room.status !== 'Maintenance')
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200/70 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                    {room.status === 'Maintenance'
                      ? 'Reopen Room'
                      : 'Maintenance'}
                  </button>

                  <button
                    type="button"
                    disabled={
                      room.status === 'Maintenance' ||
                      room.occupiedCount >= room.capacity
                    }
                    onClick={() => openAllocateModal(room.id)}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Allocate Bed
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Allocate Bed Modal */}
      {modalRoom && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="allocate-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3
                id="allocate-modal-title"
                className="text-lg font-semibold text-slate-900"
              >
                Allocate Bed in Room {modalRoom.roomNumber}
              </h3>
              <button
                type="button"
                onClick={() => setAllocateModalRoomId(null)}
                aria-label="Close allocation modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              {blockMap.get(modalRoom.blockId)?.name} ·{' '}
              {blockMap.get(modalRoom.blockId)?.genderPolicy} Policy ·{' '}
              {modalRoom.capacity - modalRoom.occupiedCount} bed(s) available
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleAllocateSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="allocate-student-select"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Select Unassigned Student
                </label>
                <select
                  id="allocate-student-select"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Choose a student...</option>
                  {unassignedStudents.map((st) => {
                    const check = canAllocateStudentToRoom(
                      st,
                      modalRoom,
                      blockMap.get(modalRoom.blockId),
                      activeAllocations
                    );
                    return (
                      <option
                        key={st.id}
                        value={st.id}
                        disabled={!check.ok}
                      >
                        {st.fullName} ({st.rollNumber} · {st.gender})
                        {!check.ok ? ' — Ineligible' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label
                  htmlFor="allocate-term"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Academic Term
                </label>
                <input
                  id="allocate-term"
                  type="text"
                  value={academicTerm}
                  onChange={(e) => setAcademicTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="allocate-notes"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Warden Notes (optional)
                </label>
                <input
                  id="allocate-notes"
                  type="text"
                  value={allocNotes}
                  onChange={(e) => setAllocNotes(e.target.value)}
                  placeholder="e.g. Early move-in approved"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAllocateModalRoomId(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Assigning...' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Bed Modal */}
      {transferAlloc && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3
                id="transfer-modal-title"
                className="text-lg font-semibold text-slate-900"
              >
                Transfer Resident
              </h3>
              <button
                type="button"
                onClick={() => setTransferAlloc(null)}
                aria-label="Close transfer modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <p className="text-sm text-slate-600">
                Reassign{' '}
                <strong className="text-slate-900">
                  {studentMap.get(transferAlloc.studentId)?.fullName}
                </strong>{' '}
                to another eligible room with open capacity.
              </p>

              <div>
                <label
                  htmlFor="transfer-room-select"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Target Room
                </label>
                <select
                  id="transfer-room-select"
                  value={transferTargetRoomId}
                  onChange={(e) => setTransferTargetRoomId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Select destination room...</option>
                  {rooms
                    .filter(
                      (r) =>
                        r.id !== transferAlloc.roomId &&
                        r.status !== 'Maintenance' &&
                        r.occupiedCount < r.capacity
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.roomNumber} ({blockMap.get(r.blockId)?.code} ·{' '}
                        {r.capacity - r.occupiedCount} open)
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferAlloc(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateRoom && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-room-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3
                id="create-room-title"
                className="text-lg font-semibold text-slate-900"
              >
                Register New Hostel Room
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateRoom(false)}
                aria-label="Close add room modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateRoomSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="new-room-block"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Hostel Wing
                </label>
                <select
                  id="new-room-block"
                  value={newRoomBlockId}
                  onChange={(e) => setNewRoomBlockId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-room-number"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Room Number
                  </label>
                  <input
                    id="new-room-number"
                    type="text"
                    value={newRoomNumber}
                    onChange={(e) => setNewRoomNumber(e.target.value)}
                    placeholder="e.g. A-305"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-room-floor"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Floor
                  </label>
                  <input
                    id="new-room-floor"
                    type="number"
                    min={1}
                    max={10}
                    value={newRoomFloor}
                    onChange={(e) => setNewRoomFloor(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label
                    htmlFor="new-room-type"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Room Type
                  </label>
                  <select
                    id="new-room-type"
                    value={newRoomType}
                    onChange={(e) => setNewRoomType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Single Studio">Single Studio</option>
                    <option value="Double Twin">Double Twin</option>
                    <option value="Triple Suite">Triple Suite</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="new-room-cap"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Beds
                  </label>
                  <input
                    id="new-room-cap"
                    type="number"
                    min={1}
                    max={6}
                    value={newRoomCapacity}
                    onChange={(e) => setNewRoomCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-room-fee"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Monthly Fee ($)
                </label>
                <input
                  id="new-room-fee"
                  type="number"
                  min={100}
                  value={newRoomFee}
                  onChange={(e) => setNewRoomFee(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label
                  htmlFor="new-room-amenities"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Amenities
                </label>
                <input
                  id="new-room-amenities"
                  type="text"
                  value={newRoomAmenities}
                  onChange={(e) => setNewRoomAmenities(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateRoom(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
