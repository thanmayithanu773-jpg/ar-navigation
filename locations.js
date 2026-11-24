/**
 * Campus AR Navigation - Database Seeder
 * Populates predefined campus locations, corridor pathway routes,
 * and initial administrator credentials.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Location = require('../models/Location');
const Route = require('../models/Route');
const Admin = require('../models/Admin');
const { isDbConnected, memoryStore, saveLocalStore, connectDB } = require('../config/database');

// Exact 10 Predefined Campus Locations specified in requirements
const PREDEFINED_LOCATIONS = [
  {
    name: 'Wash Room',
    latitude: 13.337356,
    longitude: 77.131155,
    category: 'Restroom',
    description: 'Campus executive and student restrooms with modern hygiene facilities and water dispenser.',
    building: 'Main Academic Block',
    floor: 'Ground Floor',
    status: 'active',
    landmarkFeatures: ['blue_door_frame', 'water_purifier_sign', 'restroom_hallway_lighting']
  },
  {
    name: '3rd Year BCA Classroom',
    latitude: 13.336996,
    longitude: 77.130134,
    category: 'Academic',
    description: 'Final Year BCA Lecture Hall equipped with interactive smart board, high-speed Wi-Fi, and tiered acoustic seating.',
    building: 'Computer Applications Wing',
    floor: '2nd Floor',
    status: 'active',
    landmarkFeatures: ['bca_dept_banner', 'smartboard_projector_mount', 'room_302_brass_plaque']
  },
  {
    name: '2nd Year BCA Classroom',
    latitude: 13.336973,
    longitude: 77.130062,
    category: 'Academic',
    description: 'Second Year BCA Lecture Hall featuring multimedia teaching aids and dedicated student discussion pod.',
    building: 'Computer Applications Wing',
    floor: '1st Floor',
    status: 'active',
    landmarkFeatures: ['room_201_entryway', 'digital_notice_board', 'glass_door_manifestation']
  },
  {
    name: '1st Year BCA Classroom',
    latitude: 13.336754,
    longitude: 77.129898,
    category: 'Academic',
    description: 'First Year Foundation Lecture Room with modern ergonomics and dual whiteboards.',
    building: 'Computer Applications Wing',
    floor: 'Ground Floor',
    status: 'active',
    landmarkFeatures: ['welcome_freshers_arch', 'room_101_door_sign', 'west_corridor_column']
  },
  {
    name: 'Seminar Hall',
    latitude: 13.336954,
    longitude: 77.130111,
    category: 'Auditorium',
    description: 'Air-conditioned auditorium for guest lectures, hackathons, technical symposiums, and cultural presentations.',
    building: 'Central Auditorium Complex',
    floor: 'Ground Floor',
    status: 'active',
    landmarkFeatures: ['acoustic_panel_facade', 'seminar_double_wooden_doors', 'podium_lighting']
  },
  {
    name: 'Staff Room',
    latitude: 13.336816,
    longitude: 77.130138,
    category: 'Faculty',
    description: 'BCA & Computer Science faculty workstation cabins, consultation counters, and student mentoring desks.',
    building: 'Main Academic Block',
    floor: '1st Floor',
    status: 'active',
    landmarkFeatures: ['faculty_directory_board', 'frosted_glass_partition', 'intercom_station']
  },
  {
    name: 'Meeting Room',
    latitude: 13.337001,
    longitude: 77.130134,
    category: 'Administrative',
    description: 'Executive conference room with video conferencing facilities, projector, and circular boardroom table.',
    building: 'Administrative Wing',
    floor: '1st Floor',
    status: 'active',
    landmarkFeatures: ['conference_table_oval', 'telepresence_display_unit', 'frosted_admin_entrance']
  },
  {
    name: 'Principal Office',
    latitude: 13.337017,
    longitude: 77.130165,
    category: 'Administrative',
    description: 'Office of the College Principal and executive administration suite with visitor reception lounge.',
    building: 'Administrative Wing',
    floor: 'Ground Floor',
    status: 'active',
    landmarkFeatures: ['principal_brass_nameplate', 'reception_revolving_door', 'heritage_clock_display']
  },
  {
    name: 'Library',
    latitude: 13.337043,
    longitude: 77.130291,
    category: 'Resource Center',
    description: 'Central campus library containing physical books, digital catalog terminals, silent study zones, and journal archives.',
    building: 'Central Library Block',
    floor: 'Ground Floor',
    status: 'active',
    landmarkFeatures: ['library_security_gate', 'digital_opac_kiosk', 'reading_hall_glass_portal']
  },
  {
    name: 'Academic Director Office Room',
    latitude: 13.336810,
    longitude: 77.130165,
    category: 'Administrative',
    description: 'Office of the Academic Director overseeing curriculum development, university examinations, and institutional planning.',
    building: 'Administrative Wing',
    floor: '1st Floor',
    status: 'active',
    landmarkFeatures: ['director_office_emblem', 'academic_council_wall_plaque', 'executive_lobby_plant']
  }
];

// Predefined realistic campus corridor pathways connecting adjacent locations
const PREDEFINED_PATHWAYS = [
  {
    start: 'Principal Office',
    end: 'Library',
    distance: 18.5,
    direction: 'Exit Principal Office, turn right into the East Veranda, and walk 18 meters past the garden courtyard to the Library Entrance.',
    connectedPathways: ['East Veranda Walkway', 'Courtyard Garden Path']
  },
  {
    start: 'Principal Office',
    end: 'Meeting Room',
    distance: 6.0,
    direction: 'Walk west from Principal Office entrance through the Administrative lobby for 6 meters into the Meeting Room.',
    connectedPathways: ['Admin Executive Lobby']
  },
  {
    start: 'Meeting Room',
    end: '3rd Year BCA Classroom',
    distance: 8.5,
    direction: 'Take the corridor staircase from Meeting Room north corridor up to 2nd Floor, 3rd Year BCA Classroom on your left.',
    connectedPathways: ['Staircase A', 'North 2nd Floor Hallway']
  },
  {
    start: 'Meeting Room',
    end: 'Seminar Hall',
    distance: 11.2,
    direction: 'Head south along the central tiled walkway for 11 meters towards the acoustic double doors of Seminar Hall.',
    connectedPathways: ['Central Main Atrium']
  },
  {
    start: 'Seminar Hall',
    end: '2nd Year BCA Classroom',
    distance: 9.8,
    direction: 'Head northwest through the covered breezeway, ascend first landing staircase into 2nd Year BCA Classroom.',
    connectedPathways: ['Breezeway Connector', 'West Wing Staircase 1']
  },
  {
    start: '2nd Year BCA Classroom',
    end: '1st Year BCA Classroom',
    distance: 28.4,
    direction: 'Take the west staircase down to Ground Floor and walk 25 meters south along the covered walkway to 1st Year BCA Classroom.',
    connectedPathways: ['West Corridor Ground Link', 'Foundations Foyer']
  },
  {
    start: 'Seminar Hall',
    end: 'Staff Room',
    distance: 16.0,
    direction: 'Walk south down the faculty corridor past the notice boards for 16 meters to reach the Staff Room on the right.',
    connectedPathways: ['Faculty Corridor South']
  },
  {
    start: 'Staff Room',
    end: 'Academic Director Office Room',
    distance: 4.2,
    direction: 'Step out into the faculty corridor and take the immediate doorway on the left into Academic Director Office.',
    connectedPathways: ['Faculty South Cross-Link']
  },
  {
    start: 'Library',
    end: 'Wash Room',
    distance: 102.5,
    direction: 'Exit Library main portal, follow East Avenue walkway northeast past the quadrangle garden directly to the executive Wash Room facility.',
    connectedPathways: ['East Avenue Walkway', 'Quadrangle Garden Path', 'Restroom Facility Connector']
  },
  {
    start: 'Principal Office',
    end: 'Academic Director Office Room',
    distance: 23.0,
    direction: 'Proceed south through the Administrative central corridor past the Dean showcase for 23 meters to Academic Director Office.',
    connectedPathways: ['Admin Central Corridor']
  }
];

async function seedDatabase() {
  console.log('🌱 [Seeder] Starting Campus AR Navigation database initialization...');

  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admincampus2026';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  if (isDbConnected()) {
    try {
      console.log('🗄️ [Seeder] Seeding MongoDB Atlas...');

      // 1. Seed or Upsert Admin
      const existingAdmin = await Admin.findOne({ username: adminUsername });
      if (!existingAdmin) {
        await Admin.create({
          username: adminUsername,
          passwordHash,
          role: 'superadmin'
        });
        console.log(`👤 Admin created in MongoDB: ${adminUsername}`);
      } else {
        // Keep credentials in sync with .env so the configured password always works
        const passwordMatches = existingAdmin.passwordHash
          ? await bcrypt.compare(adminPassword, existingAdmin.passwordHash)
          : false;
        if (!passwordMatches) {
          existingAdmin.passwordHash = passwordHash;
          await existingAdmin.save();
          console.log(`🔑 Admin password synced with .env for: ${adminUsername}`);
        } else {
          console.log(`👤 Admin already exists: ${adminUsername}`);
        }
      }

      // 2. Seed Locations (prevent duplicates)
      const locationMap = new Map();
      for (const loc of PREDEFINED_LOCATIONS) {
        let doc = await Location.findOne({ name: loc.name });
        if (!doc) {
          doc = await Location.create(loc);
          console.log(`📍 Created location: ${loc.name}`);
        } else {
          // Keep coordinates exact
          doc.latitude = loc.latitude;
          doc.longitude = loc.longitude;
          doc.category = loc.category;
          doc.description = loc.description;
          doc.building = loc.building;
          doc.floor = loc.floor;
          doc.status = loc.status;
          await doc.save();
        }
        locationMap.set(loc.name, doc._id);
      }

      // 3. Seed Predefined Routes
      for (const route of PREDEFINED_PATHWAYS) {
        const startId = locationMap.get(route.start);
        const endId = locationMap.get(route.end);

        if (startId && endId) {
          const existingRoute = await Route.findOne({
            $or: [
              { startLocation: startId, endLocation: endId },
              { startLocation: endId, endLocation: startId }
            ]
          });

          if (!existingRoute) {
            await Route.create({
              startLocation: startId,
              endLocation: endId,
              distance: route.distance,
              direction: route.direction,
              connectedPathways: route.connectedPathways,
              isIndoor: true,
              accessible: true
            });
            console.log(`🛣️ Seeded route: ${route.start} ↔ ${route.end}`);
          }
        }
      }

      console.log('✅ [Seeder] MongoDB Atlas seeding completed successfully!');
    } catch (err) {
      console.error('❌ [Seeder] Error seeding MongoDB Atlas:', err);
    }
  }

  // Always keep in-memory/JSON store synchronized
  syncMemoryStore(passwordHash, adminUsername);
}

function syncMemoryStore(passwordHash, adminUsername) {
  // Sync Locations
  if (memoryStore.locations.length === 0) {
    memoryStore.locations = PREDEFINED_LOCATIONS.map((loc, idx) => ({
      _id: `loc_${idx + 1}`,
      ...loc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  // Sync Admin
  const adminUser = adminUsername || (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const existingAdmin = memoryStore.admins.find(a => a.username === adminUser);
  if (!existingAdmin) {
    memoryStore.admins.push({
      _id: 'admin_1',
      username: adminUser,
      passwordHash: passwordHash || bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admincampus2026', 10),
      role: 'superadmin',
      createdAt: new Date().toISOString()
    });
  } else {
    const configuredPassword = process.env.ADMIN_PASSWORD || 'admincampus2026';
    const matches = existingAdmin.passwordHash && bcrypt.compareSync(configuredPassword, existingAdmin.passwordHash);
    if (!matches) existingAdmin.passwordHash = passwordHash;
  }

  // Sync Routes
  if (memoryStore.routes.length === 0) {
    const nameToId = new Map(memoryStore.locations.map(l => [l.name, l._id]));
    memoryStore.routes = PREDEFINED_PATHWAYS.map((p, idx) => ({
      _id: `route_${idx + 1}`,
      startLocation: nameToId.get(p.start) || p.start,
      endLocation: nameToId.get(p.end) || p.end,
      distance: p.distance,
      direction: p.direction,
      connectedPathways: p.connectedPathways,
      isIndoor: true,
      accessible: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  saveLocalStore();
  console.log(`📦 [Seeder] Local memory store synchronized with ${memoryStore.locations.length} locations & ${memoryStore.routes.length} pathways.`);
}

// Standalone execution handler
if (require.main === module) {
  (async () => {
    await connectDB();
    await seedDatabase();
    console.log('🏁 Seeding finished. Exiting...');
    process.exit(0);
  })();
}

module.exports = {
  PREDEFINED_LOCATIONS,
  PREDEFINED_PATHWAYS,
  seedDatabase
};
