package com.northgate.hostel.controller;

import com.northgate.hostel.model.Room;
import com.northgate.hostel.model.Student;
import com.northgate.hostel.service.AllocationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/hostel")
@CrossOrigin(origins = "*")
public class HostelController {

    @PersistenceContext
    private EntityManager entityManager;

    private final AllocationService allocationService;

    public HostelController(AllocationService allocationService) {
        this.allocationService = allocationService;
    }

    @GetMapping("/rooms")
    public List<Room> listRooms() {
        return entityManager
                .createQuery("SELECT r FROM Room r ORDER BY r.roomNumber ASC", Room.class)
                .getResultList();
    }

    @GetMapping("/students")
    public List<Student> listStudents() {
        return entityManager
                .createQuery("SELECT s FROM Student s ORDER BY s.fullName ASC", Student.class)
                .getResultList();
    }

    @PostMapping("/students")
    public ResponseEntity<Student> registerStudent(@RequestBody Student student) {
        entityManager.persist(student);
        return ResponseEntity.status(201).body(student);
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "northgate-spring-boot");
    }
}
