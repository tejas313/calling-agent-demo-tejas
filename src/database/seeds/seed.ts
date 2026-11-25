#!/usr/bin/env ts-node
import 'dotenv/config';
import { Client } from 'pg';

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
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
        phone VARCHAR,
        twilio_account_sid VARCHAR,
        twilio_auth_token VARCHAR,
        twilio_phone_number VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS physicians (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        specialty VARCHAR,
        clinic_id VARCHAR,
        max_daily_appointments INTEGER DEFAULT 20,
        active_referrals_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
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
        priority VARCHAR DEFAULT 'ROUTINE',
        is_overbooked BOOLEAN DEFAULT FALSE,
        overbooking_approved_by VARCHAR,
        reminder_sent_7days BOOLEAN DEFAULT FALSE,
        reminder_sent_72hours BOOLEAN DEFAULT FALSE,
        hold_expires_at TIMESTAMP,
        notes TEXT,
        callback_time VARCHAR,
        cancel_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id VARCHAR NOT NULL,
        appointment_id VARCHAR,
        clinic_id VARCHAR NOT NULL DEFAULT 'CLINIC-001',
        phone_number VARCHAR NOT NULL,
        twilio_call_sid VARCHAR,
        direction VARCHAR DEFAULT 'outbound',
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
        summary TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS referrals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_name VARCHAR NOT NULL,
        patient_phone VARCHAR NOT NULL,
        patient_dob DATE,
        patient_id VARCHAR,
        referring_physician_name VARCHAR NOT NULL,
        referring_physician_billing_number VARCHAR,
        referring_physician_contact VARCHAR,
        referral_reason TEXT NOT NULL,
        specialty_required VARCHAR NOT NULL,
        clinical_priority VARCHAR DEFAULT 'ROUTINE',
        target_wait_days INTEGER DEFAULT 30,
        assigned_physician_id VARCHAR,
        workload_score_at_assignment FLOAT,
        review_status VARCHAR DEFAULT 'PENDING_REVIEW',
        physician_notes TEXT,
        extracted_data JSONB DEFAULT '{}',
        status VARCHAR DEFAULT 'RECEIVED',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS waitlist_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id VARCHAR NOT NULL,
        physician_id VARCHAR,
        clinic_id VARCHAR NOT NULL,
        appointment_type VARCHAR NOT NULL,
        priority VARCHAR DEFAULT 'ROUTINE',
        star_rating VARCHAR DEFAULT 'STANDARD',
        target_date DATE,
        status VARCHAR DEFAULT 'WAITING',
        current_appointment_id VARCHAR,
        temporary_hold_until TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS communication_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id VARCHAR NOT NULL,
        date_time TIMESTAMP DEFAULT NOW(),
        communication_method VARCHAR DEFAULT 'PHONE',
        verified BOOLEAN DEFAULT FALSE,
        interaction_reason VARCHAR,
        patient_request TEXT,
        ai_actions TEXT,
        appointment_offered VARCHAR,
        patient_response TEXT,
        physician_contacted VARCHAR,
        physician_response TEXT,
        final_action VARCHAR,
        escalation_status VARCHAR,
        final_workflow_status VARCHAR,
        metadata JSONB
      );

      -- Ensure new columns exist on already-existing tables
      ALTER TABLE clinics ADD COLUMN IF NOT EXISTS twilio_account_sid VARCHAR;
      ALTER TABLE clinics ADD COLUMN IF NOT EXISTS twilio_auth_token VARCHAR;
      ALTER TABLE clinics ADD COLUMN IF NOT EXISTS twilio_phone_number VARCHAR;
      ALTER TABLE clinics ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
      ALTER TABLE clinics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

      ALTER TABLE physicians ADD COLUMN IF NOT EXISTS max_daily_appointments INTEGER DEFAULT 20;
      ALTER TABLE physicians ADD COLUMN IF NOT EXISTS active_referrals_count INTEGER DEFAULT 0;
      ALTER TABLE physicians ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
      ALTER TABLE physicians ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS priority VARCHAR DEFAULT 'ROUTINE';
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_overbooked BOOLEAN DEFAULT FALSE;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS overbooking_approved_by VARCHAR;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_7days BOOLEAN DEFAULT FALSE;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_72hours BOOLEAN DEFAULT FALSE;
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMP;

      ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS direction VARCHAR DEFAULT 'outbound';
      ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS summary TEXT;
    `);
    console.log('Tables created or verified.');

    // 2. Insert seed data
    await client.query(`
      INSERT INTO clinics (id, name, address, phone, twilio_phone_number) VALUES
      ('CLINIC-001', 'Maple Leaf Family Clinic', '123 Main Street, Toronto, ON', '(416) 555-0100', '+18254511690'),
      ('CLINIC-002', 'Sunridge Medical Centre', '456 King Ave, Toronto, ON', '(416) 555-0200', '+18254511690')
      ON CONFLICT (id) DO UPDATE SET twilio_phone_number = EXCLUDED.twilio_phone_number;
    `);

    await client.query(`
      INSERT INTO physicians (id, name, specialty, clinic_id, max_daily_appointments, active_referrals_count) VALUES
      ('PHY-001', 'Dr. Sarah Chen', 'Family Medicine', 'CLINIC-001', 20, 2),
      ('PHY-002', 'Dr. Michael Torres', 'Internal Medicine', 'CLINIC-001', 18, 1),
      ('PHY-003', 'Dr. Amanda Park', 'Family Medicine', 'CLINIC-002', 20, 0),
      ('PHY-004', 'Dr. James Wilson', 'Cardiology', 'CLINIC-001', 15, 3)
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
      INSERT INTO appointments (id, patient_id, clinic_id, physician_id, date, time, appointment_type, status, priority) VALUES
      ('APT-001', 'PAT-001', 'CLINIC-001', 'PHY-001', '2026-10-15', '10:00', 'Annual Physical', 'PENDING', 'ROUTINE'),
      ('APT-002', 'PAT-001', 'CLINIC-001', 'PHY-002', '2026-10-20', '14:30', 'Follow-up', 'PENDING', 'ROUTINE'),
      ('APT-003', 'PAT-002', 'CLINIC-001', 'PHY-001', '2026-10-16', '09:00', 'Annual Physical', 'PENDING', 'ROUTINE'),
      ('APT-004', 'PAT-002', 'CLINIC-001', 'PHY-002', '2026-10-22', '11:00', 'Consultation', 'CONFIRMED', 'ROUTINE'),
      ('APT-005', 'PAT-003', 'CLINIC-002', 'PHY-003', '2026-10-17', '15:00', 'Annual Physical', 'PENDING', 'ROUTINE'),
      ('APT-006', 'PAT-003', 'CLINIC-002', 'PHY-003', '2026-10-25', '10:30', 'Follow-up', 'PENDING', 'ROUTINE'),
      ('APT-007', 'PAT-004', 'CLINIC-001', 'PHY-001', '2026-10-18', '08:30', 'Consultation', 'PENDING', 'ROUTINE'),
      ('APT-008', 'PAT-004', 'CLINIC-001', 'PHY-002', '2026-10-28', '13:00', 'Annual Physical', 'PENDING', 'ROUTINE'),
      ('APT-009', 'PAT-005', 'CLINIC-002', 'PHY-003', '2026-10-19', '16:00', 'Follow-up', 'PENDING', 'ROUTINE'),
      ('APT-010', 'PAT-005', 'CLINIC-002', 'PHY-003', '2026-10-30', '09:30', 'Annual Physical', 'PENDING', 'ROUTINE')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Insert sample waitlist entries with Red Star & Blue Star
    await client.query(`
      INSERT INTO waitlist_entries (patient_id, clinic_id, physician_id, appointment_type, priority, star_rating, status, notes) VALUES
      ('PAT-002', 'CLINIC-001', 'PHY-001', 'Urgent Cardiology Evaluation', 'RED_STAR', 'RED_STAR', 'WAITING', 'High urgency cardiac symptom follow-up'),
      ('PAT-003', 'CLINIC-002', 'PHY-003', 'Expedited Follow-up', 'BLUE_STAR', 'BLUE_STAR', 'WAITING', 'Moderate risk post-op check')
      ON CONFLICT DO NOTHING;
    `);

    console.log('Seed data inserted successfully.');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
