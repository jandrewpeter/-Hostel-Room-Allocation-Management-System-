import { eq, asc, desc } from 'drizzle-orm';
import { db } from './index.ts';
import {
  hostelBlocks,
  rooms,
  students,
  allocations,
  maintenanceLogs,
} from './schema.ts';
import {
  computeRoomStatus,
  canAllocateStudentToRoom,
  getNextAvailableBedLabel,
  validateStudentInput,
} from '../utils/allocation.ts';
import {
  SEED_BLOCKS,
  SEED_ROOMS,
  SEED_STUDENTS,
  SEED_ALLOCATIONS,
  SEED_MAINTENANCE,
} from '../utils/seedData.ts';

async function ensureSeededDatabase(createdByUid: string) {
  const existingBlocks = await db.select().from(hostelBlocks).limit(1);
  if (existingBlocks.length > 0) return;

  await db.transaction(async (tx) => {
    const checkAgain = await tx.select().from(hostelBlocks).limit(1);
    if (checkAgain.length > 0) return;

    const insertedBlocks = await tx
      .insert(hostelBlocks)
      .values(
        SEED_BLOCKS.map((b) => ({
          code: b.code,
          name: b.name,
          genderPolicy: b.genderPolicy,
          floors: b.floors,
          wardenName: b.wardenName,
        }))
      )
      .returning();

    const blockIdMap = new Map<number, number>();
    SEED_BLOCKS.forEach((seedBlock, idx) => {
      if (insertedBlocks[idx]) {
        blockIdMap.set(seedBlock.id, insertedBlocks[idx].id);
      }
    });

    const insertedRooms = await tx
      .insert(rooms)
      .values(
        SEED_ROOMS.map((r) => ({
          blockId: blockIdMap.get(r.blockId) ?? insertedBlocks[0].id,
          roomNumber: r.roomNumber,
          floor: r.floor,
          roomType: r.roomType,
          capacity: r.capacity,
          occupiedCount: r.occupiedCount,
          monthlyFee: r.monthlyFee,
          status: r.status,
          amenities: r.amenities,
        }))
      )
      .returning();

    const roomIdMap = new Map<number, number>();
    SEED_ROOMS.forEach((seedRoom, idx) => {
      if (insertedRooms[idx]) {
        roomIdMap.set(seedRoom.id, insertedRooms[idx].id);
      }
    });

    const insertedStudents = await tx
      .insert(students)
      .values(
        SEED_STUDENTS.map((s) => ({
          rollNumber: s.rollNumber,
          fullName: s.fullName,
          email: s.email,
          phone: s.phone,
          department: s.department,
          academicYear: s.academicYear,
          gender: s.gender,
          feeStatus: s.feeStatus,
        }))
      )
      .returning();

    const studentIdMap = new Map<number, number>();
    SEED_STUDENTS.forEach((seedStudent, idx) => {
      if (insertedStudents[idx]) {
        studentIdMap.set(seedStudent.id, insertedStudents[idx].id);
      }
    });

    await tx.insert(allocations).values(
      SEED_ALLOCATIONS.map((a) => ({
        studentId: studentIdMap.get(a.studentId) ?? insertedStudents[0].id,
        roomId: roomIdMap.get(a.roomId) ?? insertedRooms[0].id,
        bedLabel: a.bedLabel,
        academicTerm: a.academicTerm,
        status: a.status,
        notes: a.notes,
        createdByUid,
      }))
    );

    await tx.insert(maintenanceLogs).values(
      SEED_MAINTENANCE.map((m) => ({
        roomId: roomIdMap.get(m.roomId) ?? insertedRooms[0].id,
        title: m.title,
        priority: m.priority,
        status: m.status,
      }))
    );
  });
}

export async function getHostelState(uid: string) {
  try {
    await ensureSeededDatabase(uid);
    const [blockRows, roomRows, studentRows, allocationRows, maintRows] =
      await Promise.all([
        db.select().from(hostelBlocks).orderBy(asc(hostelBlocks.id)),
        db.select().from(rooms).orderBy(asc(rooms.roomNumber)),
        db.select().from(students).orderBy(asc(students.fullName)),
        db.select().from(allocations).orderBy(desc(allocations.allocatedAt)),
        db.select().from(maintenanceLogs).orderBy(desc(maintenanceLogs.reportedAt)),
      ]);

    return {
      blocks: blockRows,
      rooms: roomRows,
      students: studentRows,
      allocations: allocationRows.map((a) => ({
        ...a,
        allocatedAt: a.allocatedAt
          ? a.allocatedAt.toISOString()
          : new Date().toISOString(),
        vacatedAt: a.vacatedAt ? a.vacatedAt.toISOString() : null,
      })),
      maintenanceLogs: maintRows.map((m) => ({
        ...m,
        reportedAt: m.reportedAt
          ? m.reportedAt.toISOString()
          : new Date().toISOString(),
      })),
    };
  } catch (error) {
    console.error('Database error fetching hostel state:', error);
    throw new Error('Unable to load hostel inventory from database.', {
      cause: error,
    });
  }
}

export async function createStudentRecord(input: {
  rollNumber: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  academicYear: number;
  gender: string;
  feeStatus?: string;
}) {
  const errors = validateStudentInput(input);
  if (Object.keys(errors).length > 0) {
    const firstMsg = Object.values(errors)[0];
    throw new Error(firstMsg);
  }

  try {
    const [created] = await db
      .insert(students)
      .values({
        rollNumber: input.rollNumber.trim().toUpperCase(),
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        department: input.department.trim(),
        academicYear: input.academicYear,
        gender: input.gender,
        feeStatus: input.feeStatus ?? 'Pending',
      })
      .returning();
    return created;
  } catch (error: unknown) {
    console.error('Database error creating student:', error);
    const msg =
      error instanceof Error && error.message.includes('unique')
        ? 'A student with that roll number already exists.'
        : 'Unable to create student record.';
    throw new Error(msg, { cause: error });
  }
}

export async function updateStudentFeeStatus(id: number, feeStatus: string) {
  if (!['Paid', 'Pending', 'Overdue'].includes(feeStatus)) {
    throw new Error('Invalid fee status.');
  }
  try {
    const [updated] = await db
      .update(students)
      .set({ feeStatus })
      .where(eq(students.id, id))
      .returning();
    if (!updated) {
      throw new Error('Student record not found.');
    }
    return updated;
  } catch (error) {
    console.error('Database error updating student fee status:', error);
    throw new Error('Unable to update student fee status.', { cause: error });
  }
}

export async function deleteStudentRecord(id: number) {
  try {
    const active = await db
      .select()
      .from(allocations)
      .where(eq(allocations.studentId, id));
    if (active.some((a) => a.status === 'Active')) {
      throw new Error(
        'Cannot remove a student with an active bed allocation. Vacate their bed first.'
      );
    }
    await db.delete(allocations).where(eq(allocations.studentId, id));
    const [deleted] = await db
      .delete(students)
      .where(eq(students.id, id))
      .returning();
    if (!deleted) {
      throw new Error('Student record not found.');
    }
    return deleted;
  } catch (error) {
    console.error('Database error deleting student:', error);
    if (error instanceof Error && error.message.includes('active bed')) {
      throw error;
    }
    throw new Error('Unable to remove student record.', { cause: error });
  }
}

export async function allocateBed(params: {
  studentId: number;
  roomId: number;
  academicTerm?: string;
  notes?: string;
  uid: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [student] = await tx
        .select()
        .from(students)
        .where(eq(students.id, params.studentId));
      if (!student) throw new Error('Selected student was not found.');

      const [room] = await tx
        .select()
        .from(rooms)
        .where(eq(rooms.id, params.roomId));
      if (!room) throw new Error('Selected room was not found.');

      const [block] = await tx
        .select()
        .from(hostelBlocks)
        .where(eq(hostelBlocks.id, room.blockId));

      const allActive = await tx
        .select()
        .from(allocations)
        .where(eq(allocations.status, 'Active'));

      const validation = canAllocateStudentToRoom(
        student,
        room,
        block,
        allActive
      );
      if (!validation.ok) {
        throw new Error(validation.reason ?? 'Allocation validation failed.');
      }

      const roomAllocations = allActive.filter((a) => a.roomId === room.id);
      const bedLabel = getNextAvailableBedLabel(
        room.capacity,
        roomAllocations.map((a) => a.bedLabel)
      );
      if (!bedLabel) {
        throw new Error(`No vacant bed slots remain in Room ${room.roomNumber}.`);
      }

      const [created] = await tx
        .insert(allocations)
        .values({
          studentId: student.id,
          roomId: room.id,
          bedLabel,
          academicTerm: params.academicTerm ?? 'Fall 2026',
          status: 'Active',
          notes: params.notes?.trim() || null,
          createdByUid: params.uid,
        })
        .returning();

      const nextOccupied = room.occupiedCount + 1;
      const nextStatus = computeRoomStatus(room.capacity, nextOccupied, false);

      await tx
        .update(rooms)
        .set({ occupiedCount: nextOccupied, status: nextStatus })
        .where(eq(rooms.id, room.id));

      return created;
    });
  } catch (error) {
    console.error('Database error allocating bed:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unable to complete bed allocation.', { cause: error });
  }
}

export async function vacateBed(allocationId: number) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(allocations)
        .where(eq(allocations.id, allocationId));
      if (!existing || existing.status !== 'Active') {
        throw new Error('Active allocation not found.');
      }

      const [room] = await tx
        .select()
        .from(rooms)
        .where(eq(rooms.id, existing.roomId));
      if (!room) throw new Error('Associated room not found.');

      const [updatedAlloc] = await tx
        .update(allocations)
        .set({ status: 'Vacated', vacatedAt: new Date() })
        .where(eq(allocations.id, allocationId))
        .returning();

      const nextOccupied = Math.max(0, room.occupiedCount - 1);
      const isMaintenance = room.status === 'Maintenance';
      const nextStatus = computeRoomStatus(
        room.capacity,
        nextOccupied,
        isMaintenance
      );

      await tx
        .update(rooms)
        .set({ occupiedCount: nextOccupied, status: nextStatus })
        .where(eq(rooms.id, room.id));

      return updatedAlloc;
    });
  } catch (error) {
    console.error('Database error vacating bed:', error);
    if (error instanceof Error) throw error;
    throw new Error('Unable to vacate bed allocation.', { cause: error });
  }
}

export async function transferBed(params: {
  allocationId: number;
  targetRoomId: number;
  uid: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(allocations)
        .where(eq(allocations.id, params.allocationId));
      if (!existing || existing.status !== 'Active') {
        throw new Error('Active allocation not found.');
      }
      if (existing.roomId === params.targetRoomId) {
        throw new Error('Resident is already assigned to this room.');
      }

      const [student] = await tx
        .select()
        .from(students)
        .where(eq(students.id, existing.studentId));
      const [oldRoom] = await tx
        .select()
        .from(rooms)
        .where(eq(rooms.id, existing.roomId));
      const [targetRoom] = await tx
        .select()
        .from(rooms)
        .where(eq(rooms.id, params.targetRoomId));
      if (!student || !oldRoom || !targetRoom) {
        throw new Error('Student or room record not found.');
      }

      const [targetBlock] = await tx
        .select()
        .from(hostelBlocks)
        .where(eq(hostelBlocks.id, targetRoom.blockId));

      const activeExcludingCurrent = (
        await tx.select().from(allocations).where(eq(allocations.status, 'Active'))
      ).filter((a) => a.id !== existing.id);

      const check = canAllocateStudentToRoom(
        student,
        targetRoom,
        targetBlock,
        activeExcludingCurrent
      );
      if (!check.ok) {
        throw new Error(check.reason ?? 'Transfer not permitted.');
      }

      const targetRoomAllocations = activeExcludingCurrent.filter(
        (a) => a.roomId === targetRoom.id
      );
      const bedLabel = getNextAvailableBedLabel(
        targetRoom.capacity,
        targetRoomAllocations.map((a) => a.bedLabel)
      );
      if (!bedLabel) {
        throw new Error(`No vacant beds in Room ${targetRoom.roomNumber}.`);
      }

      await tx
        .update(allocations)
        .set({ status: 'Transferred', vacatedAt: new Date() })
        .where(eq(allocations.id, existing.id));

      const oldOccupied = Math.max(0, oldRoom.occupiedCount - 1);
      await tx
        .update(rooms)
        .set({
          occupiedCount: oldOccupied,
          status: computeRoomStatus(
            oldRoom.capacity,
            oldOccupied,
            oldRoom.status === 'Maintenance'
          ),
        })
        .where(eq(rooms.id, oldRoom.id));

      const [created] = await tx
        .insert(allocations)
        .values({
          studentId: student.id,
          roomId: targetRoom.id,
          bedLabel,
          academicTerm: existing.academicTerm,
          status: 'Active',
          notes: `Transferred from ${oldRoom.roomNumber}`,
          createdByUid: params.uid,
        })
        .returning();

      const newOccupied = targetRoom.occupiedCount + 1;
      await tx
        .update(rooms)
        .set({
          occupiedCount: newOccupied,
          status: computeRoomStatus(targetRoom.capacity, newOccupied, false),
        })
        .where(eq(rooms.id, targetRoom.id));

      return created;
    });
  } catch (error) {
    console.error('Database error transferring bed:', error);
    if (error instanceof Error) throw error;
    throw new Error('Unable to transfer resident.', { cause: error });
  }
}

export async function toggleRoomMaintenance(
  roomId: number,
  maintenance: boolean
) {
  try {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) throw new Error('Room not found.');
    if (maintenance && room.occupiedCount > 0) {
      throw new Error(
        'Cannot place an occupied room into maintenance. Vacate or transfer residents first.'
      );
    }
    const nextStatus = computeRoomStatus(
      room.capacity,
      room.occupiedCount,
      maintenance
    );
    const [updated] = await db
      .update(rooms)
      .set({ status: nextStatus })
      .where(eq(rooms.id, roomId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database error toggling maintenance:', error);
    if (error instanceof Error) throw error;
    throw new Error('Unable to update room status.', { cause: error });
  }
}

export async function createRoomRecord(input: {
  blockId: number;
  roomNumber: string;
  floor: number;
  roomType: string;
  capacity: number;
  monthlyFee: number;
  amenities: string;
}) {
  if (!input.roomNumber.trim()) {
    throw new Error('Room number is required.');
  }
  if (input.capacity < 1 || input.capacity > 6) {
    throw new Error('Capacity must be between 1 and 6 beds.');
  }
  try {
    const [created] = await db
      .insert(rooms)
      .values({
        blockId: input.blockId,
        roomNumber: input.roomNumber.trim().toUpperCase(),
        floor: input.floor,
        roomType: input.roomType,
        capacity: input.capacity,
        occupiedCount: 0,
        monthlyFee: input.monthlyFee,
        status: 'Available',
        amenities: input.amenities.trim() || 'Standard Desk, Wi-Fi, Wardrobe',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database error creating room:', error);
    throw new Error('Unable to create room. Ensure room number is unique.', {
      cause: error,
    });
  }
}

export async function createMaintenanceLog(input: {
  roomId: number;
  title: string;
  priority: string;
}) {
  if (!input.title.trim()) {
    throw new Error('Maintenance issue description is required.');
  }
  try {
    const [created] = await db
      .insert(maintenanceLogs)
      .values({
        roomId: input.roomId,
        title: input.title.trim(),
        priority: input.priority || 'Medium',
        status: 'Open',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database error creating maintenance log:', error);
    throw new Error('Unable to create maintenance ticket.', { cause: error });
  }
}

export async function resolveMaintenanceLog(id: number) {
  try {
    const [updated] = await db
      .update(maintenanceLogs)
      .set({ status: 'Resolved' })
      .where(eq(maintenanceLogs.id, id))
      .returning();
    if (!updated) throw new Error('Maintenance ticket not found.');
    return updated;
  } catch (error) {
    console.error('Database error resolving maintenance log:', error);
    throw new Error('Unable to resolve maintenance ticket.', { cause: error });
  }
}
