-- Migration: 006_rewards.sql
-- Description: Creates the gamification badge and achievements engine.

CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon_url TEXT,
    criteria_type VARCHAR(50) NOT NULL,
    criteria_value DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rider_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (rider_id, badge_id)
);

CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    tier SMALLINT NOT NULL,
    threshold DECIMAL(10,2) NOT NULL,
    criteria_type VARCHAR(50) NOT NULL,
    reward_description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (name, tier)
);

CREATE TABLE IF NOT EXISTS rider_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    current_value DECIMAL(10,2) DEFAULT 0,
    current_tier SMALLINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (rider_id, achievement_id)
);

-- Trigger for rider_achievements updated_at
DROP TRIGGER IF EXISTS update_rider_achievements_updated_at ON rider_achievements;
CREATE TRIGGER update_rider_achievements_updated_at
BEFORE UPDATE ON rider_achievements
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
