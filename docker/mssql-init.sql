-- Run once by the `mssql-init` service in docker-compose.yml (as sa) to give
-- the bundled SQL Server container the app's database and login. Safe to
-- re-run. $(DB_NAME), $(DB_USER) and $(DB_PASSWORD) come from the
-- environment (sqlcmd scripting variables).
--
-- On an existing SQL Server, a DBA does the equivalent: create the database,
-- a SQL login for the app, and make it db_owner of that database (the app
-- creates and changes its own tables through migrations).
IF DB_ID(N'$(DB_NAME)') IS NULL
  CREATE DATABASE [$(DB_NAME)];
GO

IF SUSER_ID(N'$(DB_USER)') IS NULL
  CREATE LOGIN [$(DB_USER)] WITH PASSWORD = N'$(DB_PASSWORD)', DEFAULT_DATABASE = [$(DB_NAME)];
ELSE
  ALTER LOGIN [$(DB_USER)] WITH PASSWORD = N'$(DB_PASSWORD)';
GO

USE [$(DB_NAME)];
IF USER_ID(N'$(DB_USER)') IS NULL
  CREATE USER [$(DB_USER)] FOR LOGIN [$(DB_USER)];
ALTER ROLE db_owner ADD MEMBER [$(DB_USER)];
GO
