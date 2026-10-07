-- Proposed foundation. Execute on a fresh disposable database before adoption.
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE verification_status AS ENUM
 ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC','APPROXIMATE','UNVERIFIED','USER_SUBMITTED','PENDING_REVIEW');
CREATE TYPE source_type AS ENUM
 ('OFFICIAL_LPU','PUBLIC_MAP','OLD_LPU_MAP','USER_SUBMISSION','ADMIN_VERIFIED');
CREATE TYPE user_role AS ENUM ('VISITOR','STUDENT','FACULTY','ADMIN');
CREATE TYPE review_status AS ENUM ('PENDING','APPROVED','REJECTED','RESOLVED');

CREATE TABLE users (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 email text NOT NULL CHECK (length(btrim(email)) > 3),
 password_hash text NOT NULL,
 role user_role NOT NULL DEFAULT 'STUDENT',
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users(lower(email));

CREATE TABLE sources (
 id text PRIMARY KEY,
 type source_type NOT NULL,
 title text NOT NULL,
 url text,
 published_at date,
 retrieved_at timestamptz,
 license text,
 sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
 notes text
);
CREATE TABLE categories (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0)
);
CREATE TABLE locations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK (length(btrim(name)) > 0),
 short_name text,
 category_id bigint NOT NULL REFERENCES categories,
 description text,
 building_code text,
 floor_count integer CHECK (floor_count >= 0),
 address text,
 opening_hours jsonb,
 phone text,
 website text,
 status text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('UNKNOWN','ACTIVE','TEMPORARILY_CLOSED','CLOSED')),
 source_id text NOT NULL REFERENCES sources,
 verification_status verification_status NOT NULL DEFAULT 'UNVERIFIED',
 verification_date timestamptz,
 verified_by bigint REFERENCES users,
 latitude double precision CHECK (latitude BETWEEN -90 AND 90),
 longitude double precision CHECK (longitude BETWEEN -180 AND 180),
 location_point geography(Point,4326) GENERATED ALWAYS AS
  (CASE WHEN latitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography END) STORED,
 position_source_id text REFERENCES sources,
 position_verification verification_status NOT NULL DEFAULT 'UNVERIFIED',
 position_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 CHECK ((latitude IS NULL) = (longitude IS NULL)),
 CHECK (latitude IS NULL OR position_source_id IS NOT NULL),
 CHECK (position_verification NOT IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC') OR
  (latitude IS NOT NULL AND position_verified_at IS NOT NULL)),
 CHECK (verification_status NOT IN ('VERIFIED_OFFICIAL','VERIFIED_PUBLIC') OR verification_date IS NOT NULL)
);
CREATE INDEX locations_position_gist ON locations USING gist(location_point);
CREATE INDEX locations_name_trgm ON locations USING gin(name gin_trgm_ops);
CREATE INDEX locations_category_idx ON locations(category_id);
CREATE INDEX locations_search_idx ON locations USING gin
 (to_tsvector('english',coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(building_code,'')));

CREATE TABLE historical_locations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_id text NOT NULL REFERENCES sources,
 old_map_id integer NOT NULL CHECK (old_map_id > 0),
 old_map_name text NOT NULL CHECK (length(btrim(old_map_name)) > 0),
 proposed_category_id bigint REFERENCES categories,
 current_location_id bigint REFERENCES locations ON DELETE SET NULL,
 current_name text,
 current_status text,
 verification_status verification_status NOT NULL DEFAULT 'APPROXIMATE',
 transcription_confidence text NOT NULL CHECK (transcription_confidence IN ('LOW','MEDIUM','HIGH')),
 image_x_px numeric CHECK (image_x_px >= 0),
 image_y_px numeric CHECK (image_y_px >= 0),
 notes text,
 UNIQUE(source_id,old_map_id),
 CHECK ((image_x_px IS NULL) = (image_y_px IS NULL))
);
CREATE TABLE location_aliases (
 location_id bigint NOT NULL REFERENCES locations ON DELETE CASCADE,
 alias text NOT NULL CHECK (length(btrim(alias)) > 0),
 source_id text NOT NULL REFERENCES sources,
 PRIMARY KEY(location_id,alias)
);
CREATE INDEX aliases_search_idx ON location_aliases USING gin(alias gin_trgm_ops);
CREATE TABLE location_evidence (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 location_id bigint NOT NULL REFERENCES locations ON DELETE CASCADE,
 source_id text NOT NULL REFERENCES sources,
 claim_field text NOT NULL,
 claim_value jsonb NOT NULL,
 verification_status verification_status NOT NULL DEFAULT 'UNVERIFIED',
 reviewed_by bigint REFERENCES users,
 reviewed_at timestamptz
);
CREATE TABLE facilities (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL UNIQUE
);
CREATE TABLE location_facilities (
 location_id bigint NOT NULL REFERENCES locations ON DELETE CASCADE,
 facility_id bigint NOT NULL REFERENCES facilities,
 source_id text NOT NULL REFERENCES sources,
 verification_status verification_status NOT NULL DEFAULT 'UNVERIFIED',
 PRIMARY KEY(location_id,facility_id)
);

CREATE TABLE path_nodes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 point geography(Point,4326) NOT NULL CHECK (NOT ST_IsEmpty(point::geometry)),
 source_id text NOT NULL REFERENCES sources,
 verification_status verification_status NOT NULL DEFAULT 'UNVERIFIED'
);
CREATE INDEX path_nodes_gist ON path_nodes USING gist(point);
CREATE TABLE path_edges (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 from_node_id bigint NOT NULL REFERENCES path_nodes,
 to_node_id bigint NOT NULL REFERENCES path_nodes,
 path geography(LineString,4326) NOT NULL CHECK (NOT ST_IsEmpty(path::geometry)),
 distance_m double precision GENERATED ALWAYS AS (ST_Length(path)) STORED,
 estimated_seconds integer CHECK (estimated_seconds > 0),
 accessible boolean, -- NULL means unassessed, not accessible.
 blocked boolean NOT NULL DEFAULT false,
 one_way boolean NOT NULL DEFAULT false,
 road_type text,
 source_id text NOT NULL REFERENCES sources,
 verification_status verification_status NOT NULL DEFAULT 'UNVERIFIED',
 accessibility_source_id text REFERENCES sources,
 accessibility_checked_at timestamptz,
 CHECK (from_node_id <> to_node_id),
 CHECK (ST_Length(path) > 0),
 CHECK (accessible IS NULL OR (accessibility_source_id IS NOT NULL AND accessibility_checked_at IS NOT NULL))
);
CREATE INDEX path_edges_gist ON path_edges USING gist(path);
CREATE INDEX path_edges_from_idx ON path_edges(from_node_id);
CREATE INDEX path_edges_to_idx ON path_edges(to_node_id);
CREATE TABLE location_entrances (
 location_id bigint NOT NULL REFERENCES locations ON DELETE CASCADE,
 node_id bigint NOT NULL REFERENCES path_nodes,
 name text,
 source_id text NOT NULL REFERENCES sources,
 PRIMARY KEY(location_id,node_id)
);
-- Edge endpoints must coincide with their declared nodes to within 1 meter.
CREATE FUNCTION check_edge_endpoints() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM path_nodes a, path_nodes b
  WHERE a.id=NEW.from_node_id AND b.id=NEW.to_node_id
   AND ST_DWithin(a.point,ST_StartPoint(NEW.path::geometry)::geography,1)
   AND ST_DWithin(b.point,ST_EndPoint(NEW.path::geometry)::geography,1)) THEN
  RAISE EXCEPTION 'Edge geometry must join its declared nodes';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER edge_endpoints BEFORE INSERT OR UPDATE ON path_edges
 FOR EACH ROW EXECUTE FUNCTION check_edge_endpoints();
-- Prevent moving a referenced node while existing edges retain their old geometry.
CREATE FUNCTION protect_connected_node() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT ST_Equals(OLD.point::geometry,NEW.point::geometry) AND EXISTS
  (SELECT 1 FROM path_edges WHERE from_node_id=OLD.id OR to_node_id=OLD.id) THEN
  RAISE EXCEPTION 'Remove and recreate incident edges when relocating a node';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER connected_node BEFORE UPDATE ON path_nodes
 FOR EACH ROW EXECUTE FUNCTION protect_connected_node();

CREATE TABLE favorites (
 user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
 location_id bigint NOT NULL REFERENCES locations ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,location_id)
);
CREATE TABLE recent_searches (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
 query text NOT NULL CHECK (length(query) BETWEEN 1 AND 300),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recent_searches_user_idx ON recent_searches(user_id,created_at DESC);
CREATE TABLE reports (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 location_id bigint REFERENCES locations ON DELETE SET NULL,
 user_id bigint REFERENCES users ON DELETE SET NULL,
 report_type text NOT NULL CHECK (report_type IN
  ('WRONG_LOCATION','WRONG_NAME','WRONG_CATEGORY','WRONG_OPENING_HOURS','MISSING_FACILITY','CLOSED_LOCATION','DUPLICATE_LOCATION','OTHER')),
 description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 5000),
 suggested_value jsonb,
 status review_status NOT NULL DEFAULT 'PENDING',
 admin_comment text,
 reviewed_by bigint REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 CHECK (status='PENDING' OR (reviewed_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX reports_queue_idx ON reports(status,created_at);
CREATE TABLE submissions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id bigint REFERENCES users ON DELETE SET NULL,
 payload jsonb NOT NULL,
 status review_status NOT NULL DEFAULT 'PENDING',
 reviewed_by bigint REFERENCES users,
 reviewed_at timestamptz,
 admin_comment text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status='PENDING' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX submissions_queue_idx ON submissions(status,created_at);
CREATE TABLE announcements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 title text NOT NULL,
 description text NOT NULL,
 location_id bigint REFERENCES locations ON DELETE SET NULL,
 start_date timestamptz NOT NULL,
 end_date timestamptz,
 priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
 created_by bigint NOT NULL REFERENCES users,
 CHECK (end_date IS NULL OR end_date > start_date)
);
CREATE INDEX announcements_dates_idx ON announcements(start_date,end_date);
CREATE TABLE auth_tokens (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 purpose text NOT NULL CHECK (purpose IN ('REFRESH','PASSWORD_RESET')),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id bigint REFERENCES users,
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 before_value jsonb,
 after_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION touch_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.updated_at=now(); NEW.version=OLD.version+1; RETURN NEW;
END $$;
CREATE TRIGGER location_updated BEFORE UPDATE ON locations
 FOR EACH ROW EXECUTE FUNCTION touch_location();
COMMIT;
