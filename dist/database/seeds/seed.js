#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
require("dotenv/config");
const _pg = require("pg");
async function seed() {
    const client = new _pg.Client({
        connectionString: process.env.DATABASE_URL
    });
    try {
        await client.connect();
        console.log('Connected to database.');
        // 1. Create tables if they do not exist
        await client.query(`
      CREATE TABLE IF NOT EXISTS clinics (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        address VARCHAR,
        phone VARCHAR
      );

      CREATE TABLE IF NOT EXISTS physicians (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        specialty VARCHAR,
        clinic_id VARCHAR
      );

      CREATE TABLE IF NOT EXISTS patients (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        phone VARCHAR UNIQUE NOT NULL,
        date_of_birth DATE,
        language VARCHAR DEFAULT 'en',
        clinic_id VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id VARCHAR PRIMARY KEY,
        patient_id VARCHAR,
        clinic_id VARCHAR,
        physician_id VARCHAR,
        date DATE,
        time VARCHAR,
        appointment_type VARCHAR,
        status VARCHAR DEFAULT 'PENDING',
        notes TEXT,
        callback_time VARCHAR,
        cancel_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id VARCHAR NOT NULL,
        appointment_id VARCHAR NOT NULL,
        clinic_id VARCHAR NOT NULL,
        phone_number VARCHAR NOT NULL,
        twilio_call_sid VARCHAR,
        language VARCHAR DEFAULT 'en',
        call_type VARCHAR DEFAULT 'appointment_confirmation',
        status VARCHAR DEFAULT 'INITIATED',
        outcome VARCHAR,
        transcript JSONB DEFAULT '[]',
        conversation_history JSONB DEFAULT '[]',
        current_turn INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log('Tables created or verified.');
        // 2. Insert seed data
        await client.query(`
      INSERT INTO clinics (id, name, address, phone) VALUES
      ('CLINIC-001', 'Maple Leaf Family Clinic', '123 Main Street, Toronto, ON', '(416) 555-0100'),
      ('CLINIC-002', 'Sunridge Medical Centre', '456 King Ave, Toronto, ON', '(416) 555-0200')
      ON CONFLICT (id) DO NOTHING;
    `);
        await client.query(`
      INSERT INTO physicians (id, name, specialty, clinic_id) VALUES
      ('PHY-001', 'Dr. Sarah Chen', 'Family Medicine', 'CLINIC-001'),
      ('PHY-002', 'Dr. Michael Torres', 'Internal Medicine', 'CLINIC-001'),
      ('PHY-003', 'Dr. Amanda Park', 'Family Medicine', 'CLINIC-002')
      ON CONFLICT (id) DO NOTHING;
    `);
        await client.query(`
      INSERT INTO patients (id, name, phone, date_of_birth, language, clinic_id) VALUES
      ('PAT-001', 'John Smith', '+14165551001', '1980-03-15', 'en', 'CLINIC-001'),
      ('PAT-002', 'Maria Garcia', '+14165551002', '1975-07-22', 'en', 'CLINIC-001'),
      ('PAT-003', 'David Lee', '+14165551003', '1990-11-08', 'en', 'CLINIC-002'),
      ('PAT-004', 'Sarah Johnson', '+14165551004', '1965-04-30', 'fr', 'CLINIC-001'),
      ('PAT-005', 'Robert Brown', '+14165551005', '1955-09-12', 'en', 'CLINIC-002')
      ON CONFLICT (id) DO NOTHING;
    `);
        await client.query(`
      INSERT INTO appointments (id, patient_id, clinic_id, physician_id, date, time, appointment_type, status) VALUES
      ('APT-001', 'PAT-001', 'CLINIC-001', 'PHY-001', '2026-10-15', '10:00', 'Annual Physical', 'PENDING'),
      ('APT-002', 'PAT-001', 'CLINIC-001', 'PHY-002', '2026-10-20', '14:30', 'Follow-up', 'PENDING'),
      ('APT-003', 'PAT-002', 'CLINIC-001', 'PHY-001', '2026-10-16', '09:00', 'Annual Physical', 'PENDING'),
      ('APT-004', 'PAT-002', 'CLINIC-001', 'PHY-002', '2026-10-22', '11:00', 'Consultation', 'CONFIRMED'),
      ('APT-005', 'PAT-003', 'CLINIC-002', 'PHY-003', '2026-10-17', '15:00', 'Annual Physical', 'PENDING'),
      ('APT-006', 'PAT-003', 'CLINIC-002', 'PHY-003', '2026-10-25', '10:30', 'Follow-up', 'PENDING'),
      ('APT-007', 'PAT-004', 'CLINIC-001', 'PHY-001', '2026-10-18', '08:30', 'Consultation', 'PENDING'),
      ('APT-008', 'PAT-004', 'CLINIC-001', 'PHY-002', '2026-10-28', '13:00', 'Annual Physical', 'PENDING'),
      ('APT-009', 'PAT-005', 'CLINIC-002', 'PHY-003', '2026-10-19', '16:00', 'Follow-up', 'PENDING'),
      ('APT-010', 'PAT-005', 'CLINIC-002', 'PHY-003', '2026-10-30', '09:30', 'Annual Physical', 'PENDING')
      ON CONFLICT (id) DO NOTHING;
    `);
        console.log('Seed data inserted successfully.');
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    } finally{
        await client.end();
    }
}
seed();

//# sourceMappingURL=seed.js.map