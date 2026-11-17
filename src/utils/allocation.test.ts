import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRoomStatus,
  getNextAvailableBedLabel,
  canAllocateStudentToRoom,
  computeOccupancyMetrics,
  validateStudentInput,
} from './allocation';

test('computeRoomStatus returns accurate lifecycle statuses', () => {
  assert.equal(computeRoomStatus(2, 0, false), 'Available');
  assert.equal(computeRoomStatus(2, 1, false), 'Partial');
  assert.equal(computeRoomStatus(2, 2, false), 'Full');
  assert.equal(computeRoomStatus(2, 1, true), 'Maintenance');
});

test('getNextAvailableBedLabel finds first vacant bed slot', () => {
  assert.equal(getNextAvailableBedLabel(2, []), 'Bed 1');
  assert.equal(getNextAvailableBedLabel(2, ['Bed 1']), 'Bed 2');
  assert.equal(getNextAvailableBedLabel(3, ['Bed 1', 'Bed 3']), 'Bed 2');
  assert.equal(getNextAvailableBedLabel(2, ['Bed 1', 'Bed 2']), null);
});

test('canAllocateStudentToRoom enforces capacity, maintenance, gender policy, and double-booking', () => {
  const blockMale = { id: 1, genderPolicy: 'Male', name: 'North Wing A' };
  const roomOpen = {
    id: 10,
    capacity: 2,
    occupiedCount: 1,
    status: 'Partial',
    roomNumber: 'A-101',
  };
  const roomFull = { ...roomOpen, occupiedCount: 2, status: 'Full' };
  const roomMaint = { ...roomOpen, status: 'Maintenance' };

  const maleStudent = { id: 101, gender: 'Male', fullName: 'Aarav Nair' };
  const femaleStudent = { id: 102, gender: 'Female', fullName: 'Maya Chen' };

  assert.equal(
    canAllocateStudentToRoom(maleStudent, roomOpen, blockMale, []).ok,
    true
  );
  assert.equal(
    canAllocateStudentToRoom(femaleStudent, roomOpen, blockMale, []).ok,
    false
  );
  assert.equal(
    canAllocateStudentToRoom(maleStudent, roomFull, blockMale, []).ok,
    false
  );
  assert.equal(
    canAllocateStudentToRoom(maleStudent, roomMaint, blockMale, []).ok,
    false
  );
  assert.equal(
    canAllocateStudentToRoom(maleStudent, roomOpen, blockMale, [
      { studentId: 101, roomId: 99, status: 'Active' },
    ]).ok,
    false
  );
});

test('computeOccupancyMetrics aggregates bed capacity, waitlist, and revenue', () => {
  const rooms = [
    {
      id: 1,
      blockId: 1,
      roomNumber: 'A-101',
      floor: 1,
      roomType: 'Double Twin',
      capacity: 2,
      occupiedCount: 2,
      monthlyFee: 450,
      status: 'Full',
      amenities: 'Wi-Fi, Desk',
    },
    {
      id: 2,
      blockId: 1,
      roomNumber: 'A-102',
      floor: 1,
      roomType: 'Single Studio',
      capacity: 1,
      occupiedCount: 0,
      monthlyFee: 650,
      status: 'Available',
      amenities: 'Wi-Fi, AC',
    },
    {
      id: 3,
      blockId: 1,
      roomNumber: 'A-103',
      floor: 1,
      roomType: 'Double Twin',
      capacity: 2,
      occupiedCount: 0,
      monthlyFee: 450,
      status: 'Maintenance',
      amenities: 'Wi-Fi',
    },
  ];
  const students = [
    {
      id: 1,
      rollNumber: 'CS2601',
      fullName: 'Student One',
      email: 's1@uni.edu',
      phone: '5551234567',
      department: 'CS',
      academicYear: 2,
      gender: 'Male',
      feeStatus: 'Paid',
    },
    {
      id: 2,
      rollNumber: 'CS2602',
      fullName: 'Student Two',
      email: 's2@uni.edu',
      phone: '5551234568',
      department: 'EE',
      academicYear: 1,
      gender: 'Male',
      feeStatus: 'Pending',
    },
  ];
  const allocations = [
    {
      id: 1,
      studentId: 1,
      roomId: 1,
      bedLabel: 'Bed 1',
      academicTerm: 'Fall 2026',
      status: 'Active',
      allocatedAt: '2026-08-20T00:00:00Z',
      vacatedAt: null,
      notes: null,
    },
  ];

  const metrics = computeOccupancyMetrics(rooms, students, allocations);
  assert.equal(metrics.totalBeds, 3);
  assert.equal(metrics.occupiedBeds, 2);
  assert.equal(metrics.vacantBeds, 1);
  assert.equal(metrics.occupancyRate, 67);
  assert.equal(metrics.maintenanceRooms, 1);
  assert.equal(metrics.assignedStudents, 1);
  assert.equal(metrics.waitlistedStudents, 1);
  assert.equal(metrics.monthlyProjectedRevenue, 900);
  assert.equal(metrics.pendingFeeCount, 1);
});

test('validateStudentInput rejects invalid fields and accepts valid data', () => {
  const invalidErrors = validateStudentInput({
    rollNumber: 'A',
    fullName: '',
    email: 'bad-email',
    phone: '12',
    department: '',
    academicYear: 9,
    gender: 'Other',
  });
  assert.ok(invalidErrors.rollNumber);
  assert.ok(invalidErrors.fullName);
  assert.ok(invalidErrors.email);
  assert.ok(invalidErrors.phone);
  assert.ok(invalidErrors.department);
  assert.ok(invalidErrors.academicYear);
  assert.ok(invalidErrors.gender);

  const validErrors = validateStudentInput({
    rollNumber: 'ENG-2026-042',
    fullName: 'Priya Subramanian',
    email: 'priya.s@northgate.edu',
    phone: '+1 555-390-2211',
    department: 'Mechanical Engineering',
    academicYear: 3,
    gender: 'Female',
  });
  assert.deepEqual(validErrors, {});
});
