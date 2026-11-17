import { relations } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('warden'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const hostelBlocks = pgTable('hostel_blocks', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  genderPolicy: text('gender_policy').notNull(),
  floors: integer('floors').notNull(),
  wardenName: text('warden_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  blockId: integer('block_id')
    .references(() => hostelBlocks.id)
    .notNull(),
  roomNumber: text('room_number').notNull().unique(),
  floor: integer('floor').notNull(),
  roomType: text('room_type').notNull(),
  capacity: integer('capacity').notNull(),
  occupiedCount: integer('occupied_count').notNull().default(0),
  monthlyFee: integer('monthly_fee').notNull(),
  status: text('status').notNull().default('Available'),
  amenities: text('amenities').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const students = pgTable('students', {
  id: serial('id').primaryKey(),
  rollNumber: text('roll_number').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  department: text('department').notNull(),
  academicYear: integer('academic_year').notNull(),
  gender: text('gender').notNull(),
  feeStatus: text('fee_status').notNull().default('Pending'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const allocations = pgTable('allocations', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id')
    .references(() => students.id)
    .notNull(),
  roomId: integer('room_id')
    .references(() => rooms.id)
    .notNull(),
  bedLabel: text('bed_label').notNull(),
  academicTerm: text('academic_term').notNull().default('Fall 2026'),
  status: text('status').notNull().default('Active'),
  allocatedAt: timestamp('allocated_at').defaultNow(),
  vacatedAt: timestamp('vacated_at'),
  notes: text('notes'),
  createdByUid: text('created_by_uid').references(() => users.uid),
});

export const maintenanceLogs = pgTable('maintenance_logs', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id')
    .references(() => rooms.id)
    .notNull(),
  title: text('title').notNull(),
  priority: text('priority').notNull().default('Medium'),
  status: text('status').notNull().default('Open'),
  reportedAt: timestamp('reported_at').defaultNow(),
});

export const hostelBlocksRelations = relations(hostelBlocks, ({ many }) => ({
  rooms: many(rooms),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  block: one(hostelBlocks, {
    fields: [rooms.blockId],
    references: [hostelBlocks.id],
  }),
  allocations: many(allocations),
  maintenanceLogs: many(maintenanceLogs),
}));

export const studentsRelations = relations(students, ({ many }) => ({
  allocations: many(allocations),
}));

export const allocationsRelations = relations(allocations, ({ one }) => ({
  student: one(students, {
    fields: [allocations.studentId],
    references: [students.id],
  }),
  room: one(rooms, {
    fields: [allocations.roomId],
    references: [rooms.id],
  }),
  createdBy: one(users, {
    fields: [allocations.createdByUid],
    references: [users.uid],
  }),
}));

export const maintenanceLogsRelations = relations(maintenanceLogs, ({ one }) => ({
  room: one(rooms, {
    fields: [maintenanceLogs.roomId],
    references: [rooms.id],
  }),
}));
