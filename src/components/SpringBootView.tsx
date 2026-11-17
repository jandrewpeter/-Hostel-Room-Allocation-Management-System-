import { useState } from 'react';
import { Check, Copy, FileCode2 } from 'lucide-react';

const SPRING_BOOT_FILES = [
  {
    name: 'HostelController.java',
    path: 'spring-boot-backend/src/main/java/com/northgate/hostel/controller/HostelController.java',
    code: `@RestController
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
}`,
  },
  {
    name: 'AllocationService.java',
    path: 'spring-boot-backend/src/main/java/com/northgate/hostel/service/AllocationService.java',
    code: `@Service
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
}`,
  },
  {
    name: 'Room.java (JPA Entity)',
    path: 'spring-boot-backend/src/main/java/com/northgate/hostel/model/Room.java',
    code: `@Entity
@Table(name = "rooms")
public class Room {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "block_id", nullable = false)
    private Long blockId;

    @Column(name = "room_number", nullable = false, unique = true)
    private String roomNumber;

    @Column(nullable = false)
    private Integer floor;

    @Column(name = "room_type", nullable = false)
    private String roomType;

    @Column(nullable = false)
    private Integer capacity;

    @Column(name = "occupied_count", nullable = false)
    private Integer occupiedCount = 0;

    @Column(name = "monthly_fee", nullable = false)
    private Integer monthlyFee;

    @Column(nullable = false)
    private String status = "Available";
}`,
  },
  {
    name: 'pom.xml',
    path: 'spring-boot-backend/pom.xml',
    code: `<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.5</version>
    </parent>
    <groupId>com.northgate</groupId>
    <artifactId>hostel-allocation-service</artifactId>
    <version>1.0.0</version>
    <properties>
        <java.version>21</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
    </dependencies>
</project>`,
  },
];

export function SpringBootView() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeFile = SPRING_BOOT_FILES[selectedIdx];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-900">
          Java Spring Boot 3 Companion Service
        </h3>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-3xl">
          The live preview runs in this container on Express + Vite + Cloud SQL PostgreSQL. A complete Java 21 / Spring Boot 3.3 Maven project mapped to the exact same PostgreSQL schema is included in the repository under{' '}
          <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
            spring-boot-backend/
          </code>{' '}
          for standalone JVM deployment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {SPRING_BOOT_FILES.map((file, idx) => (
            <button
              key={file.name}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors ${
                selectedIdx === idx
                  ? 'bg-blue-50/80 text-blue-900'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <FileCode2 className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs font-mono text-slate-400 truncate">
                  {file.path}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-4">
            <span className="font-mono text-xs text-slate-300 truncate">
              {activeFile.path}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Copy Source
                </>
              )}
            </button>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-100 overflow-x-auto leading-relaxed">
            <code>{activeFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
