CREATE TABLE api_rate_limits (
  user_id text NOT NULL,
  route_key varchar(100) NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (user_id, route_key)
);
CREATE INDEX api_rate_limits_window_idx ON api_rate_limits(window_started_at);
