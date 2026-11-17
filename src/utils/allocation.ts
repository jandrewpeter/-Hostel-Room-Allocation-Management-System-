export type GenderPolicy = 'Male' | 'Female' | 'Co-Ed';
export type RoomStatus = 'Available' | 'Partial' | 'Full' | 'Maintenance';
export type RoomType = 'Single Studio' | 'Double Twin' | 'Triple Suite';
export type FeeStatus = 'Paid' | 'Pending' | 'Overdue';

export interface HostelBlock {
  id: number;
  code: string;
  name: string;
  genderPolicy: string;
  floors: number;
  wardenName: string;
}

export interface Room {
  id: number;
  blockId: number;
  roomNumber: string;
  floor: number;
  roomType: string;
  capacity: number;
  occupiedCount: number;
  monthlyFee: number;
  status: string;
  amenities: string;
}

export interface Student {
  id: number;
  rollNumber: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  academicYear: number;
  gender: string;
  feeStatus: string;
}

export interface Allocation {
  id: number;
  studentId: number;
  roomId: number;
  bedLabel: string;
  academicTerm: string;
  status: string;
  allocatedAt: string;
  vacatedAt: string | null;
  notes: string | null;
}

export interface MaintenanceLog {
  id: number;
  roomId: number;
  title: string;
  priority: string;
  status: string;
  reportedAt: string;
}

export function computeRoomStatus(
  capacity: number,
  occupiedCount: number,
  isMaintenance: boolean
): RoomStatus {
  if (isMaintenance) return 'Maintenance';
  if (occupiedCount <= 0) return 'Available';
  if (occupiedCount >= capacity) return 'Full';
  return 'Partial';
}

export function getNextAvailableBedLabel(
  capacity: number,
  occupiedLabels: string[]
): string | null {
  const taken = new Set(occupiedLabels.map((l) => l.trim()));
  for (let i = 1; i <= capacity; i += 1) {
    const label = `Bed ${i}`;
    if (!taken.has(label)) {
      return label;
    }
  }
  return null;
}

export function canAllocateStudentToRoom(
  student: Pick<Student, 'id' | 'gender' | 'fullName'>,
  room: Pick<Room, 'id' | 'capacity' | 'occupiedCount' | 'status' | 'roomNumber'>,
  block: Pick<HostelBlock, 'id' | 'genderPolicy' | 'name'> | undefined,
  activeAllocations: Array<Pick<Allocation, 'studentId' | 'roomId' | 'status'>>
): { ok: boolean; reason?: string } {
  if (room.status === 'Maintenance') {
    return {
      ok: false,
      reason: `Room ${room.roomNumber} is currently closed for maintenance.`,
    };
  }
  if (room.occupiedCount >= room.capacity) {
    return {
      ok: false,
      reason: `Room ${room.roomNumber} is at full capacity (${room.occupiedCount}/${room.capacity}).`,
    };
  }
  if (
    block &&
    block.genderPolicy !== 'Co-Ed' &&
    student.gender !== block.genderPolicy
  ) {
    return {
      ok: false,
      reason: `${block.name} is designated ${block.genderPolicy}-only; ${student.fullName} cannot be assigned here.`,
    };
  }
  const alreadyAssigned = activeAllocations.some(
    (a) => a.studentId === student.id && a.status === 'Active'
  );
  if (alreadyAssigned) {
    return {
      ok: false,
      reason: `${student.fullName} already holds an active bed allocation. Use Transfer or Vacate first.`,
    };
  }
  return { ok: true };
}

export interface OccupancyMetrics {
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  occupancyRate: number;
  maintenanceRooms: number;
  totalStudents: number;
  assignedStudents: number;
  waitlistedStudents: number;
  monthlyProjectedRevenue: number;
  pendingFeeCount: number;
}

export function computeOccupancyMetrics(
  rooms: Room[],
  students: Student[],
  allocations: Allocation[]
): OccupancyMetrics {
  const activeRooms = rooms.filter((r) => r.status !== 'Maintenance');
  const totalBeds = activeRooms.reduce((sum, r) => sum + r.capacity, 0);
  const occupiedBeds = activeRooms.reduce(
    (sum, r) => sum + Math.min(r.occupiedCount, r.capacity),
    0
  );
  const vacantBeds = Math.max(0, totalBeds - occupiedBeds);
  const occupancyRate =
    totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
  const maintenanceRooms = rooms.filter(
    (r) => r.status === 'Maintenance'
  ).length;

  const activeStudentIds = new Set(
    allocations.filter((a) => a.status === 'Active').map((a) => a.studentId)
  );
  const assignedStudents = students.filter((s) =>
    activeStudentIds.has(s.id)
  ).length;
  const waitlistedStudents = Math.max(0, students.length - assignedStudents);

  const monthlyProjectedRevenue = rooms.reduce(
    (sum, r) => sum + r.occupiedCount * r.monthlyFee,
    0
  );
  const pendingFeeCount = students.filter((s) => s.feeStatus !== 'Paid').length;

  return {
    totalBeds,
    occupiedBeds,
    vacantBeds,
    occupancyRate,
    maintenanceRooms,
    totalStudents: students.length,
    assignedStudents,
    waitlistedStudents,
    monthlyProjectedRevenue,
    pendingFeeCount,
  };
}

export interface StudentInput {
  rollNumber: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  academicYear: number;
  gender: string;
}

export function validateStudentInput(
  input: StudentInput
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.rollNumber.trim() || input.rollNumber.trim().length < 3) {
    errors.rollNumber = 'Roll number must be at least 3 characters.';
  }
  if (!input.fullName.trim() || input.fullName.trim().length < 2) {
    errors.fullName = 'Full name is required.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = 'Enter a valid university email address.';
  }
  if (!/^[+\d\s()-]{7,20}$/.test(input.phone.trim())) {
    errors.phone = 'Enter a valid phone number (7–20 digits).';
  }
  if (!input.department.trim()) {
    errors.department = 'Department is required.';
  }
  if (
    !Number.isInteger(input.academicYear) ||
    input.academicYear < 1 ||
    input.academicYear > 6
  ) {
    errors.academicYear = 'Academic year must be between 1 and 6.';
  }
  if (!['Male', 'Female', 'Non-Binary'].includes(input.gender)) {
    errors.gender = 'Select a valid gender designation.';
  }
  return errors;
}
