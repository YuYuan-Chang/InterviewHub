-- One database + dedicated credentials per service: enforces service boundaries
-- (a service physically cannot join across another service's tables).

CREATE USER auth_svc WITH PASSWORD 'auth_pw';
CREATE DATABASE auth_db OWNER auth_svc;

CREATE USER user_svc WITH PASSWORD 'user_pw';
CREATE DATABASE user_db OWNER user_svc;

CREATE USER post_svc WITH PASSWORD 'post_pw';
CREATE DATABASE post_db OWNER post_svc;

CREATE USER file_svc WITH PASSWORD 'file_pw';
CREATE DATABASE file_db OWNER file_svc;

CREATE USER comment_svc WITH PASSWORD 'comment_pw';
CREATE DATABASE comment_db OWNER comment_svc;

CREATE USER notification_svc WITH PASSWORD 'notification_pw';
CREATE DATABASE notification_db OWNER notification_svc;
