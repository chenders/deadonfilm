delete from title_basics where "isAdult" = true;
alter table name_basics rename column nconst to person_id;
alter table name_basics drop column s_soundex ;
alter table name_basics drop column "primaryProfession";
alter table name_basics drop column ns_soundex ;
alter table name_basics drop column sn_soundex ;
alter table name_basics add column death_date text;
alter table name_basics rename column "primaryName" to primary_name;
alter table name_basics drop column "knownForTitles";
alter table name_basics rename column "deathYear" to death_year;
