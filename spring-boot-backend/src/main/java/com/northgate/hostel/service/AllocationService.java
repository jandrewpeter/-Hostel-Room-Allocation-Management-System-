package com.northgate.hostel.service;

import com.northgate.hostel.model.Room;
import com.northgate.hostel.model.Student;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AllocationService {

    public String computeRoomStatus(int capacity, int occupiedCount, boolean maintenance) {
        if (maintenance) return "Maintenance";
        if (occupiedCount <= 0) return "Available";
        if (occupiedCount >= capacity) return "Full";
        return "Partial";
    }

    @Transactional
    public void validateAllocation(Student student, Room room, String blockGenderPolicy) {
        if ("Maintenance".equalsIgnoreCase(room.getStatus())) {
            throw new IllegalStateException("Room " + room.getRoomNumber() + " is under maintenance.");
        }
        if (room.getOccupiedCount() >= room.getCapacity()) {
            throw new IllegalStateException("Room " + room.getRoomNumber() + " is at full capacity.");
        }
        if (!"Co-Ed".equalsIgnoreCase(blockGenderPolicy)
                && !blockGenderPolicy.equalsIgnoreCase(student.getGender())) {
            throw new IllegalArgumentException("Block gender policy mismatch for " + student.getFullName());
        }
    }
}
