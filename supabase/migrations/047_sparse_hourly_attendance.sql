-- Sparse hourly: present (/) is default — remove stored present rows
delete from hourly_attendance where status = '/';
