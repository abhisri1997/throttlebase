-- Migration: 007_notifications_and_settings.sql
-- Description: Creates notifications, app preferences, privacy settings, and blocked riders.

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    body TEXT,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    push_enabled BOOLEAN DEFAULT true,
    in_app_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    UNIQUE (rider_id, notification_type)
);

CREATE TABLE IF NOT EXISTS rider_settings (
    rider_id UUID PRIMARY KEY REFERENCES riders(id) ON DELETE CASCADE,
    theme VARCHAR(10) DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    language VARCHAR(10) DEFAULT 'en',
    distance_unit VARCHAR(5) DEFAULT 'km' CHECK (distance_unit IN ('km', 'mi')),
    speed_unit VARCHAR(5) DEFAULT 'kmh' CHECK (speed_unit IN ('kmh', 'mph')),
    date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
    extra JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger for rider_settings updated_at
DROP TRIGGER IF EXISTS update_rider_settings_updated_at ON rider_settings;
CREATE TRIGGER update_rider_settings_updated_at
BEFORE UPDATE ON rider_settings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TABLE IF NOT EXISTS rider_privacy_settings (
    rider_id UUID PRIMARY KEY REFERENCES riders(id) ON DELETE CASCADE,
    profile_visibility VARCHAR(20) DEFAULT 'public' CHECK (profile_visibility IN ('public', 'riders_only', 'private')),
    ride_history_visibility VARCHAR(20) DEFAULT 'public' CHECK (ride_history_visibility IN ('public', 'riders_only', 'private')),
    leaderboard_opt_in BOOLEAN DEFAULT true,
    invite_permission VARCHAR(20) DEFAULT 'everyone' CHECK (invite_permission IN ('everyone', 'followers_only', 'no_one')),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger for rider_privacy_settings updated_at
DROP TRIGGER IF EXISTS update_rider_privacy_settings_updated_at ON rider_privacy_settings;
CREATE TRIGGER update_rider_privacy_settings_updated_at
BEFORE UPDATE ON rider_privacy_settings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TABLE IF NOT EXISTS blocked_riders (
    blocker_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (rider_id, is_read, created_at DESC);
